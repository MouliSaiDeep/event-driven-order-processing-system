import pytest
import requests
import time
import uuid
import os

ORDER_SERVICE_URL = os.getenv("ORDER_SERVICE_URL", "http://localhost:3005")
ORDER_STATUS_SERVICE_URL = os.getenv("ORDER_STATUS_SERVICE_URL", "http://localhost:3006")

def poll_for_status(order_id, expected_status=None, expected_inventory=None, expected_payment=None, timeout=15):
    start_time = time.time()
    final_status = None
    
    while time.time() - start_time < timeout:
        status_res = requests.get(f"{ORDER_STATUS_SERVICE_URL}/api/orders/{order_id}")
        
        if status_res.status_code == 200:
            status_data = status_res.json()
            print(f"Polling {order_id} status: {status_data['status']}")
            
            if expected_status and status_data['status'] == expected_status:
                final_status = status_data
                break
            elif not expected_status and status_data['status'] in ['COMPLETED', 'FAILED']:
                final_status = status_data
                break
        
        time.sleep(1)
        
    if final_status is None:
        pytest.fail(f"Order {order_id} timed out before reaching final status. Last checked at {time.time() - start_time}s")
        
    if expected_status:
        assert final_status['status'] == expected_status, f"Expected {expected_status}, got {final_status['status']}"
    if expected_inventory:
        assert final_status['inventory_status'] == expected_inventory, f"Expected inventory {expected_inventory}, got {final_status['inventory_status']}"
    if expected_payment:
        assert final_status['payment_status'] == expected_payment, f"Expected payment {expected_payment}, got {final_status['payment_status']}"
        
    return final_status

def test_1_happy_path_prod_001():
    """Scenario 1: Happy path for prod-001"""
    payload = {
        "user_id": f"test-user-{uuid.uuid4()}",
        "items": [{"product_id": "prod-001", "quantity": 1}],
        "idempotency_key": str(uuid.uuid4())
    }
    response = requests.post(f"{ORDER_SERVICE_URL}/api/orders", json=payload)
    assert response.status_code == 202
    order_id = response.json()["order_id"]
    poll_for_status(order_id, "COMPLETED", "RESERVED", "PAID")

def test_2_happy_path_prod_002():
    """Scenario 2: Happy path for prod-002"""
    payload = {
        "user_id": f"test-user-{uuid.uuid4()}",
        "items": [{"product_id": "prod-002", "quantity": 1}],
        "idempotency_key": str(uuid.uuid4())
    }
    response = requests.post(f"{ORDER_SERVICE_URL}/api/orders", json=payload)
    assert response.status_code == 202
    order_id = response.json()["order_id"]
    poll_for_status(order_id, "COMPLETED", "RESERVED", "PAID")

def test_3_idempotency_same_key():
    """Scenario 3: Idempotency check with same key"""
    idem_key = str(uuid.uuid4())
    payload = {
        "user_id": f"test-user-{uuid.uuid4()}",
        "items": [{"product_id": "prod-003", "quantity": 1}],
        "idempotency_key": idem_key
    }
    
    # Request 1
    response1 = requests.post(f"{ORDER_SERVICE_URL}/api/orders", json=payload)
    assert response1.status_code == 202
    order_id_1 = response1.json()["order_id"]
    
    # Request 2 (Exact same payload)
    response2 = requests.post(f"{ORDER_SERVICE_URL}/api/orders", json=payload)
    assert response2.status_code == 202
    order_id_2 = response2.json()["order_id"]
    
    # Verify Order 1 completes
    poll_for_status(order_id_1, "COMPLETED", "RESERVED", "PAID")
    
    # Verify Order 2 (second request with same idempotency key) should not be processed
    # Order Status Service ignores the second OrderCreated event due to duplicate idempotency_key
    start_time = time.time()
    second_order_found = False
    while time.time() - start_time < 5:
        # Check if the second order ID even exists in the read model
        status_res = requests.get(f"{ORDER_STATUS_SERVICE_URL}/api/orders/{order_id_2}")
        if status_res.status_code == 200:
            second_order_found = True
            break
        time.sleep(1)
        
    assert not second_order_found, f"Second order {order_id_2} with same idempotency key was processed!"

def test_4_insufficient_stock():
    """Scenario 4: Insufficient stock for existing product"""
    payload = {
        "user_id": f"test-user-{uuid.uuid4()}",
        "items": [{"product_id": "prod-004", "quantity": 5000}], # Exceeds seeded stock
        "idempotency_key": str(uuid.uuid4())
    }
    response = requests.post(f"{ORDER_SERVICE_URL}/api/orders", json=payload)
    assert response.status_code == 202
    order_id = response.json()["order_id"]
    
    # Inventory failure is the only deterministic assertion in this scenario.
    # Payment is processed independently and may already be PAID by the time
    # status becomes FAILED.
    poll_for_status(order_id, "FAILED", "FAILED")

def test_5_payment_failure():
    """Scenario 5: Payment failure triggered by specific user"""
    payload = {
        "user_id": "fail-user",
        "items": [{"product_id": "prod-005", "quantity": 1}],
        "idempotency_key": str(uuid.uuid4())
    }
    response = requests.post(f"{ORDER_SERVICE_URL}/api/orders", json=payload)
    assert response.status_code == 202
    order_id = response.json()["order_id"]
    
    # Should fail due to payment
    poll_for_status(order_id, "FAILED", "RESERVED", "FAILED")