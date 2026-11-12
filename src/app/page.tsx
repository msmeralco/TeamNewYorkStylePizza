// Backend landing page: lists the API. The real app screens are built by the frontend team.
const ENDPOINTS: [string, string, string][] = [
  ["GET", "/api/health", "Liveness, version, reader mode"],
  ["GET", "/api/sample?which=compound", "Sample compound state"],
  ["POST", "/api/scan/bill", "Bill photo to fields"],
  ["POST", "/api/scan/meter", "Meter photo to reading and serial"],
  ["POST", "/api/split", "Shares and per-line breakdown"],
  ["POST", "/api/rate-check", "Charged rate vs the bill's rate"],
  ["POST", "/api/forecast", "Usage forecast and the 50 kWh line"],
  ["POST", "/api/check", "Readings add up, typed chips, gap rule"],
  ["POST", "/api/tenant-link", "Make a tenant link"],
  ["GET", "/api/tenant/{token}", "Tenant view"],
];

export default function Home() {
  return (
    <main style={{ maxWidth: 720 }}>
      <h1>Kahati API</h1>
      <p>Contract: docs/API.md in the repo. Sample data only. Computed by Kahati. Not a Meralco statement.</p>
      <ul>
        {ENDPOINTS.map(([m, p, d]) => (
          <li key={p}>
            <code>{m} {p}</code> - {d}
          </li>
        ))}
      </ul>
    </main>
  );
}
