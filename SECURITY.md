# Security

ControlBench is designed as a **local, single-user tool**. The API has **no authentication**: anyone who can reach it can read, create and delete experiments. By default the backend listens on `127.0.0.1` only, and CORS only allows the local dashboard (`http://localhost:5173`, `http://127.0.0.1:5173`). Requests addressed to any host name other than `localhost` or `127.0.0.1` are rejected, which protects against DNS rebinding from malicious websites.

Do not expose the backend to a network or the internet (for example with `uvicorn --host 0.0.0.0`) unless you put your own access control in front of it.

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's [private vulnerability reporting](https://github.com/maximilian467/ControlBench/security/advisories/new) instead. As this is an early-stage solo project, responses are best effort.
