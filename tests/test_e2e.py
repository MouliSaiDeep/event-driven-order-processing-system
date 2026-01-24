import pytest
import requests
import time
import uuid

ORDER_SERVICE_URL = "http://localhost:3000"
ORDER_STATUS_SERVICE_URL = "http://localhost:3001"

@pytest.fixture
def unique_order_payload():
    return {
        "user_id": f"test-user-{uuid.uuid4()}",
        "items": [
            {"product_id": "prod-001", "quantity": 1}
        ]
    }

def test_order_completion_flow(unique_order_payload):
    """
    Test the full happy path:
    1. Create Order -> 202 Accepted
    2. Poll Status -> Wait for COMPLETED
    3. Verify Inventory and Payment statuses are correct
    """
    # 1. Create Order
    response = requests.post(f"{ORDER_SERVICE_URL}/api/orders", json=unique_order_payload)
    assert response.status_code == 202
    data = response.json()
    assert "order_id" in data
    order_id = data["order_id"]
    print(f"\nOrder created: {order_id}")

    # 2. Poll for Completion (Max 10 seconds)
    timeout = 10
    start_time = time.time()
    
    final_status = None
    
    while time.time() - start_time < timeout:
        status_res = requests.get(f"{ORDER_STATUS_SERVICE_URL}/api/orders/{order_id}")
        
        if status_res.status_code == 200:
            status_data = status_res.json()
            print(f"Polling status: {status_data['status']}")
            
            if status_data['status'] == 'COMPLETED':
                final_status = status_data
                break
            if status_data['status'] == 'FAILED':
                pytest.fail(f"Order failed unexpectedly: {status_data}")
        
        time.sleep(1)

    assert final_status is not None, "Order timed out before reaching COMPLETED status"
    assert final_status['status'] == 'COMPLETED'
    assert final_status['inventory_status'] == 'RESERVED'
    assert final_status['payment_status'] == 'PAID'

def test_invalid_product_inventory_fail():
    """
    Test failure path:
    1. Create Order with non-existent product
    2. Poll Status -> Wait for FAILED (Inventory Failed)
    """
    payload = {
        "user_id": "fail-user",
        "items": [{"product_id": "non-existent-prod", "quantity": 1}]
    }
    
    response = requests.post(f"{ORDER_SERVICE_URL}/api/orders", json=payload)
    assert response.status_code == 202
    order_id = response.json()["order_id"]
    
    # Poll for Failure
    timeout = 10
    start_time = time.time()
    final_status = None
    
    while time.time() - start_time < timeout:
        status_res = requests.get(f"{ORDER_STATUS_SERVICE_URL}/api/orders/{order_id}")
        if status_res.status_code == 200:
            status_data = status_res.json()
            if status_data['status'] == 'FAILED':
                final_status = status_data
                break
        time.sleep(1)
        
    assert final_status is not None
    assert final_status['status'] == 'FAILED'