FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Inventory service is a background worker (consumer), but might expose health/metrics later.
# For now, no specific EXPOSE needed, but good practice.

CMD ["npm", "start"]
