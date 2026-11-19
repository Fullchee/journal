// Reads the smoke-flow API from the host, so a flow checks what the server stored, not what the screen shows.
const body = json(http.get("http://localhost:8798/api/check-ins").body);
output.checkIns = body.checkIns.length;
