FROM ghcr.io/puppeteer/puppeteer:latest

# Switch to root user to install necessary dependencies if needed, though the puppeteer image has most.
# The image already includes Chromium and its dependencies.

USER root

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy app source
COPY . .

# Rely on the Puppeteer image's default Chromium installation
# The image already configures the path correctly.

# Give permissions to the pptruser so whatsapp-web.js can create .wwebjs_auth
RUN chown -R pptruser:pptruser /usr/src/app

# Switch back to the unprivileged user provided by the image
USER pptruser

# Expose the port
EXPOSE 3000

# Start the application
CMD [ "npm", "start" ]
