# Use official Node.js image
FROM node:22

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json first (optimizes caching)
COPY package*.json ./

# Install dependencies (including Tailwind CSS)
RUN npm install

# Copy the rest of the app files
COPY . .

# Expose React default port
EXPOSE 3000

# Start the React app
CMD ["npm", "start"]
