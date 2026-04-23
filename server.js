import express from "express";
import axios from "axios";
import { CookieJar } from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";

const app = express();
const PORT = process.env.PORT || 3000;

// Create axios instance with cookie jar
const jar = new CookieJar();
const client = wrapper(axios.create({
  jar,
  withCredentials: true,
  maxRedirects: 5,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1"
  }
}));

// Helper: wait
const wait = ms => new Promise(r => setTimeout(r, ms));

// Try to load login page until Cloudflare challenge clears
async function loadLoginPage() {
  for (let i = 0; i < 5; i++) {
    const res = await client.get("https://www.gaugemastertrade.com/customer/account/login/");
    const html = res.data;

    if (!html.includes("Attention Required") && html.includes("form_key")) {
      return html;
    }

    console.log("Cloudflare challenge detected, retrying…");
    await wait(1500);
  }

  throw new Error("Cloudflare blocked the login page");
}

// LOGIN FUNCTION
async function login() {
  console.log("Logging in…");

  const html = await loadLoginPage();

  const formKeyMatch = html.match(/name="form_key" value="([^"]+)"/);
  if (!formKeyMatch) throw new Error("Could not find form_key");

  const form_key = formKeyMatch[1];

  await client.post(
    "https://www.gaugemastertrade.com/customer/account/loginPost/",
    new URLSearchParams({
      form_key,
      "login[username]": process.env.GAUGE_USER,
      "login[password]": process.env.GAUGE_PASS
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );

  console.log("Logged in successfully.");
}

// PRODUCT SCRAPER ENDPOINT
app.get("/product", async (req, res) => {
  const sku = req.query.sku;
  if (!sku) return res.json({ error: "Missing sku parameter" });

  try {
    await login();

    const searchUrl = "https://www.gaugemastertrade.com/catalogsearch/result/?q=" + encodeURIComponent(sku);
    const searchPage = await client.get(searchUrl);
    const searchHtml = searchPage.data;

    const urlMatch = searchHtml.match(/<a[^>]*href="(https:\/\/www\.gaugemastertrade\.com[^"]+)"/);
    if (!urlMatch) return res.json({ error: "Product not found" });

    const productUrl = urlMatch[1];

    const productPage = await client.get(productUrl);
    const productHtml = productPage.data;

    const stockMatch = productHtml.match(/class="stock.*?<span[^>]*>(.*?)<\/span>/s);
    const availability = stockMatch ? stockMatch[1].replace(/<[^>]+>/g, "").trim() : "Unknown";

    res.json({
      sku,
      url: productUrl,
      availability
    });

  } catch (err) {
    console.error(err);
    res.json({ error: err.message });
  }
});

app.listen(PORT, () => console.log("Proxy running on port " + PORT));
