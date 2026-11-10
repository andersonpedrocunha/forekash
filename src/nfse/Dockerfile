# Node, e não Deno nem Workers: a Sefin Nacional é IIS com TLS 1.2 e exige
# mTLS por rota. O rustls (base do Deno e dos Workers) não fecha handshake
# com ela — testado em 10/11/2026. Só cliente OpenSSL passa.
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY dps.js cofre.js servidor.js ./
# Sem estado: o certificado chega cifrado a cada chamada e morre com ela.
ENV NODE_ENV=production
EXPOSE 8080
USER node
CMD ["node", "servidor.js"]
