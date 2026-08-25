export default {
  providers: [
    {
      // Set this in your Convex deployment env vars:
      //   npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://<your-app>.clerk.accounts.dev"
      // (Use the "Frontend API URL" shown in Clerk -> JWT Templates -> convex)
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
