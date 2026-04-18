# Corpus

Drop `.md`, `.txt`, or `.pdf` files into this folder. The backend will index
them on startup and ground Claude's answers in their contents.

Suggested starters for the telepsychiatry assistant:

- DEA Ryan Haight / telemedicine final rule (PDF from DEA.gov)
- Your state's medical board telemedicine rules (TX, NC, etc.)
- PDMP/PMP statutes for each state you practice in
- Your practice's current policies (for the assistant to reference, not replace)
- Collaborative practice agreement templates you've vetted

The first `index.json` in this folder is the embedding cache. It's safe to
delete — the backend will rebuild it. Do NOT commit it to git for anything
containing PHI.
