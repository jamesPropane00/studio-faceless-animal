FROM mcr.microsoft.com/playwright:v1.55.0-noble
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY server.js ./
RUN useradd --create-home --uid 10001 operator && chown -R operator:operator /app
USER operator
ENV PORT=8788
ENV NODE_ENV=production
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:8788/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","server.js"]
