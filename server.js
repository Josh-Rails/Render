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
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Accept": "text/html,application/xhtml+xml"
  }
}));

// LOGIN FUNCTION
async function login() {
  console.log("Logging in…");

  // Step 1: Get login page
  const loginPage = await client.get("https://www.gaugemastertrade.com/customer/account/login/");
  const html = loginPage.data;

  const formKeyMatch = html.match(/name="form_key" value="([^"]+)"/);
  if (!formKeyMatch) throw new Error("Could not find form_key");

  const form_key = formKeyMatch[1];

  // Step 2: Submit login
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
    // Ensure logged in
    await login();

    // Search page
    const searchUrl = "https://www.gaugemastertrade.com/catalogsearch/result/?q=" + encodeURIComponent(sku);
    const searchPage = await client.get(searchUrl);
    const searchHtml = searchPage.data;

    // Extract product URL
    const urlMatch = searchHtml.match(/<a[^>]*href="(https:\/\/www\.gaugemastertrade\.com[^"]+)"/);
    if (!urlMatch) return res.json({ error: "Product not found" });

    const productUrl = urlMatch[1];

    // Load product page
    const productPage = await client.get(productUrl);
    const productHtml = productPage.data;

    // Extract availability
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
