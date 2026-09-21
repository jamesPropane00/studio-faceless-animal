FROM mcr.microsoft.com/playwright:v1.55.0-noble
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY server.js ./
ENV PORT=8788
EXPOSE 8788
CMD ["node","server.js"]
