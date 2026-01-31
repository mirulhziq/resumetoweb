FROM node:20-alpine

WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./backend/

# Install backend dependencies
WORKDIR /app/backend
RUN npm install --production

# Copy all files
WORKDIR /app
COPY . .

# Expose port
EXPOSE 3000

# Start the server
WORKDIR /app/backend
CMD ["node", "server.js"]
