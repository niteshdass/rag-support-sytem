# SupportPilot

A RAG-powered customer support automation platform for mid-market SaaS companies — ingests your docs, past tickets, and Slack threads, then drafts answers inside Zendesk/Intercom or resolves Tier 1 tickets automatically.

## Run locally

```bash
cp .env.example .env        # set MONGODB_URI
nvm use                     # node 20
npm install
npm run dev                 # starts on http://localhost:3000
curl http://localhost:3000/health
```
