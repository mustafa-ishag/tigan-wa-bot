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

# Set environment variable so puppeteer uses the installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Give permissions to the pptruser so whatsapp-web.js can create .wwebjs_auth
RUN chown -R pptruser:pptruser /usr/src/app

# Switch back to the unprivileged user provided by the image
USER pptruser

# Expose the port
EXPOSE 3000

# Start the application
CMD [ "npm", "start" ]
