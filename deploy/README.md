# Deploy na VPS (saída do Replit)

Mesmo modelo do Honorários Control: o GitHub Actions monta a imagem
(`ghcr.io/redeg7/techsupportcrm`), copia o `docker-compose.yml` para
`/opt/techsupport` na VPS do Hub e faz `pull` + `up`. O HTTPS é feito pelo
Caddy do Hub (repo conciliacao-bancaria), que encaminha
**suporte.redeg7.com** para o container (`techsupport-app:5000`).

- **app**: o sistema (Node.js), só em `127.0.0.1:5002` na VPS.
- **db**: PostgreSQL 17 próprio, sem porta exposta (não mexe nos bancos do Hub e do Honorários).
- Volumes: `uploads` (anexos e logos), `whatsapp_auth` (sessão do WhatsApp).

## 1. DNS

No DNS de `redeg7.com`, crie o registro (mesmo IP do hub):

| Nome    | Tipo | Valor     |
|---------|------|-----------|
| suporte | A    | IP da VPS |

## 2. Secrets do GitHub

Em **RedeG7/TechSupportCRM → Settings → Secrets and variables → Actions**,
cadastre os mesmos três do honorariocontrol:

| Secret        | Valor                                  |
|---------------|----------------------------------------|
| `VPS_HOST`    | IP da VPS                              |
| `VPS_USER`    | usuário SSH (ex.: `root`)              |
| `VPS_SSH_KEY` | chave privada SSH (a mesma do honorariocontrol) |

Opcionais (vão para o `.env` da VPS a cada deploy): `ANTHROPIC_API_KEY`,
`EMAIL_SERVICE`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM`, `APP_URL`.
Copie os valores dos Secrets do Replit.

## 3. Primeiro deploy

Em **Actions → Build e Deploy → Run workflow**. Na primeira vez o deploy cria
`/opt/techsupport/.env` sozinho, com `POSTGRES_PASSWORD` e `SESSION_SECRET`
aleatórios. Com o banco vazio, as tabelas são criadas automaticamente
(`deploy/entrypoint.sh`); um banco que já tem dados nunca é alterado.

## 4. Trazer os dados do Replit

**No Shell do Replit:**

```bash
pg_dump "$DATABASE_URL" -Fc --no-owner --no-acl -f backup.dump
tar czf arquivos.tar.gz uploads
```

Baixe os dois arquivos (botão direito → Download) e envie para a VPS:

```bash
scp backup.dump arquivos.tar.gz root@IP_DA_VPS:/opt/techsupport/
```

Depois rode **Actions → Virada para produção → Run workflow**, digitando
`VIRADA`. Ele valida o backup, guarda uma cópia do banco atual da VPS,
restaura o do Replit, copia os anexos e confere se o sistema voltou. Pode
ser repetido (por exemplo, no dia da troca definitiva, com um backup novo).

## 5. Conferir e desligar o Replit

1. Acesse https://suporte.redeg7.com e entre com os usuários de sempre.
2. **WhatsApp**: a sessão não vem do Replit. Desconecte o WhatsApp no Replit
   e escaneie o QR Code de novo no sistema novo (o mesmo número não pode
   ficar conectado nos dois).
3. Com tudo conferido, pare o deploy do Replit.

## Comandos úteis na VPS

```bash
cd /opt/techsupport
docker compose ps
docker compose logs -f app
docker compose exec db pg_dump -U techsupport -Fc techsupport > backup-$(date +%F).dump
```
