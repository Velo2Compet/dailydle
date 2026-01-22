import { withValidManifest } from "@coinbase/onchainkit/minikit";
import { minikitConfig } from "../../../minikit.config";

export async function GET() {
  const { header, payload, signature } = minikitConfig.accountAssociation;
  if (!header || !payload || !signature) {
    return new Response(
      JSON.stringify({ error: "MiniApp manifest not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
  return Response.json(withValidManifest(minikitConfig));
}
