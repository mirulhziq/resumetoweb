FROM node:20-alpine

WORKDIR /app

# Copy backend package files first
COPY backend/package*.json ./backend/

# Install backend dependencies
WORKDIR /app/backend
RUN npm install --omit=dev

# Go back to app root
WORKDIR /app

# Copy frontend
COPY frontend ./frontend

# Copy backend source (excluding node_modules via .dockerignore)
COPY backend/*.js ./backend/
COPY backend/services ./backend/services
COPY backend/routes ./backend/routes
COPY backend/templates ./backend/templates

# Create required directories
RUN mkdir -p backend/uploads backend/generated backend/logs backend/data

# Expose port
EXPOSE 3000

# Start the server
WORKDIR /app/backend
CMD ["node", "server.js"]
