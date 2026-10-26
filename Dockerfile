FROM node:20-bookworm-slim

WORKDIR /app

# O puppeteer (whatsapp-web.js, caminho antigo) não baixa o Chrome: o WhatsApp
# usado pelo sistema é o Baileys, que não precisa de navegador.
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    PORT=5000

# Arquivos enviados e sessão do WhatsApp (volumes no docker-compose)
RUN mkdir -p uploads whatsapp-auth whatsapp-session
VOLUME ["/app/uploads", "/app/whatsapp-auth", "/app/whatsapp-session"]

EXPOSE 5000
ENTRYPOINT ["sh", "deploy/entrypoint.sh"]
