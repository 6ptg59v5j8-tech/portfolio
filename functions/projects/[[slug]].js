
export async function onRequest(context) {
  const assetUrl = new URL(
    "/project.html",
    context.request.url
  );

  return context.env.ASSETS.fetch(assetUrl);
}
