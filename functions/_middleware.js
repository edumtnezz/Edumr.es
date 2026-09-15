const BLOCKED = [
  /\.txt$/i,
  /\.md$/i,
  /^\/wrangler\.toml$/i,
  /^\/functions/i,
  /^\/deploy\.ps1$/i,
  /(^|\/)\.(git|wrangler|assetsignore|gitignore)/i,
];

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname;

  if (BLOCKED.some((re) => re.test(path))) {
    return new Response("Not Found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return context.next();
}