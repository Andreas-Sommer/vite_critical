import puppeteer from "puppeteer-core";
import penthouse from "penthouse";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import minimist from "minimist";
import postcss from "postcss";
import postcssSafeParser from "postcss-safe-parser";
import cssnano from "cssnano";
import { execSync } from "child_process";

class CriticalCssGenerator {
  constructor() {
    this._loadConfig();
    this._loadEnv();
    this._loadManifest();
  }

  _loadConfig() {
    try {
      this.config = {};
      const YAML_CONFIG_PATH = "critical.yaml";
      if (fs.existsSync(YAML_CONFIG_PATH)) {
        this.config = yaml.load(fs.readFileSync(YAML_CONFIG_PATH, "utf8"));
        console.log(`✅ Loaded global defaults from ${YAML_CONFIG_PATH}`);
      } else {
        console.error(`❌ Error: ${YAML_CONFIG_PATH} not found!`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Error loading YAML configuration (${YAML_CONFIG_PATH}):`, error);
      process.exit(1);
    }
  }

  _loadEnv() {
    const args = minimist(process.argv.slice(2));
    this.env = args.env || this.config.ENV || "Development";
    this.absoluteViteOutputPath = args.outputpath || this.config.VITE_OUTPUT_PATH || "public/assets/";
    this.relativeViteOutputPath = this.absoluteViteOutputPath.replace(/^public\//, "");
  }

  _loadManifest() {
    this.manifestPath = path.join(this.absoluteViteOutputPath, ".vite/manifest.json");
    if (!fs.existsSync(this.manifestPath)) {
      console.error(`❌ Manifest file not found at ${this.manifestPath}`);
      process.exit(1);
    } else {
      this.manifest = JSON.parse(fs.readFileSync(this.manifestPath, "utf-8"));
      console.log(`✅ Loaded Vite manifest from ${this.manifestPath}`);
    }
  }

  async run() {
    const sitesPath = path.join("config", "sites");
    if (!fs.existsSync(sitesPath)) {
      console.error(`❌ Sites directory not found: ${sitesPath}`);
      return;
    }

    const sites = fs.readdirSync(sitesPath).filter(f => {
        try {
            return fs.statSync(path.join(sitesPath, f)).isDirectory();
        } catch (e) {
            return false;
        }
    });

    for (const siteIdentifier of sites) {
      await this._processSite(siteIdentifier);
    }

    // Save manifest once at the end
    fs.writeFileSync(this.manifestPath, JSON.stringify(this.manifest, null, 2));
    console.log("\n✅ manifest.json updated successfully!");
  }

  async _processSite(siteIdentifier) {
    const configPath = path.join("config", "sites", siteIdentifier, "config.yaml");
    if (!fs.existsSync(configPath)) return;

    try {
      const siteConfig = yaml.load(fs.readFileSync(configPath, "utf8"));
      const viteCritical = siteConfig.viteCritical?.criticalCss;

      if (!viteCritical?.enable) {
        // console.log(`ℹ️ Site ${siteIdentifier}: Critical CSS disabled.`);
        return;
      }

      console.log(`\n--- Processing Site: ${siteIdentifier} ---`);

      const baseVariant = siteConfig.baseVariants?.find(v => v.condition.includes(this.env));
      let siteBaseUrl = (baseVariant?.base || siteConfig.base || "").replace(/\/$/, "");

      if (!siteBaseUrl) {
          console.warn(`⚠️ No base URL found for site ${siteIdentifier} in ${this.env} context.`);
          return;
      }

      const entryPointForPid = viteCritical.entryPointForPid || {};
      const siteSettings = viteCritical.settings || {};

      // Merged settings for this site
      const activeSettings = {
        width: siteSettings.width || this.config.WIDTH || 412,
        height: siteSettings.height || this.config.HEIGHT || 823,
        renderWaitTime: siteSettings.renderWaitTime || this.config.RENDER_WAIT_TIME || 300,
        forceInclude: [...(this.config.FORCE_INCLUDE || []), ...(siteSettings.forceInclude || [])],
        selectorsRemove: [...(this.config.SELECTORS_REMOVE || []), ...(siteSettings.selectorsRemove || [])],
        propertiesRemove: [...(this.config.PROPERTIES_REMOVE || []), ...(siteSettings.propertiesRemove || [])],
        blockJSRequests: siteSettings.blockJSRequests ?? this.config.BLOCK_JS_REQUESTS ?? true,
        timeout: siteSettings.timeout || this.config.TIMEOUT || 30000,
      };

      for (const [template, pidsRaw] of Object.entries(entryPointForPid)) {
        await this._processTemplate(siteIdentifier, template, pidsRaw, siteBaseUrl, activeSettings);
      }

    } catch (e) {
      console.error(`❌ Error processing site ${siteIdentifier}:`, e.message);
    }
  }

  async _processTemplate(siteIdentifier, template, pidsRaw, siteBaseUrl, settings) {
    const templateName = template.endsWith('_css') ? template : `${template}_css`;
    const searchName = `${siteIdentifier}_${templateName}`;
    const manifestEntry = Object.values(this.manifest).find(item => item.name === searchName);

    if (!manifestEntry) {
      console.warn(`⚠️ No manifest entry found for ${searchName}. Skipping.`);
      return;
    }

    const pids = String(pidsRaw).split(",").map(p => p.trim()).filter(Boolean);
    if (pids.length === 0) return;

    const slugs = this._resolveSlugs(siteIdentifier, pids);

    for (const pid of pids) {
      const slug = slugs[pid] || "/";
      const url = siteBaseUrl + slug + (siteBaseUrl.includes('?') || slug.includes('?') ? '&' : '?') + 'tx_vitecritical_css[omit]=1';
      console.log(`🚀 Generating Critical CSS for ${siteIdentifier} | Template: ${template} | PID: ${pid} | URL: ${url}`);

      const criticalCss = await this._generateForUrl(url, manifestEntry, settings);
      if (criticalCss) {
        const hashMatch = manifestEntry.file ? manifestEntry.file.match(/-(\w+)\.(css|js)$/) : null;
        const fileHash = hashMatch ? hashMatch[1] : "nohash";

        // Use consistent naming with hyphens as requested
        const fileName = `${siteIdentifier}-${template}-critical-pid${pid}-${fileHash}.css`.replace(/_/g, '-');
        const outputPath = path.join(this.absoluteViteOutputPath, fileName);
        const publicPath = path.join(this.relativeViteOutputPath, fileName);

        fs.writeFileSync(outputPath, criticalCss);
        console.log(`✅ Saved to ${outputPath}`);

        if (!manifestEntry.criticalByPid) manifestEntry.criticalByPid = {};
        manifestEntry.criticalByPid[pid] = publicPath;
      }
    }
  }

  _resolveSlugs(siteIdentifier, pids) {
    try {
      const command = `php vendor/bin/typo3 vite_critical:get-slugs --site ${siteIdentifier} --pids ${pids.join(",")}`;
      const output = execSync(command).toString();
      return JSON.parse(output);
    } catch (e) {
      console.error(`❌ Error resolving slugs for ${siteIdentifier}:`, e.message);
      return {};
    }
  }

  async _generateForUrl(url, manifestEntry, settings) {
    const browserArgs = this.config.PUPPETEER_ARGS || ["--no-sandbox"];
    let browser = null;

    try {
      const cssFiles = (manifestEntry.css || []).map(f => path.join(this.absoluteViteOutputPath, f));
      if (manifestEntry.file && manifestEntry.file.endsWith(".css")) {
        cssFiles.push(path.join(this.absoluteViteOutputPath, manifestEntry.file));
      }

      if (cssFiles.length === 0) {
          console.warn(`⚠️ No CSS files found in manifest for ${manifestEntry.name}`);
          return null;
      }

      const cssString = cssFiles.map(f => fs.readFileSync(f, "utf8")).join("\n");

      // Launch the browser explicitly using the direct puppeteer dependency
      browser = await puppeteer.launch({
        executablePath: "/usr/bin/chromium",
        args: browserArgs
      });

      // 1. Create a new page to check the status code
      const page = await browser.newPage();

      // Navigate to the URL
      const response = await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: parseInt(settings.timeout, 10)
      });

      const statusCode = response.status();

      // 2. Check: Only status 200 is allowed
      if (statusCode !== 200) {
        console.error(`❌ Error: Page returned status ${statusCode} for ${url}. Skipping generation.`);
        await page.close();
        return null;
      }

      await page.close();

      const options = {
        url,
        cssString,
        width: parseInt(settings.width, 10),
        height: parseInt(settings.height, 10),
        forceInclude: settings.forceInclude,
        blockJSRequests: settings.blockJSRequests,
        renderWaitTime: parseInt(settings.renderWaitTime, 10),
        timeout: parseInt(settings.timeout, 10),
        // Pass the existing browser instance to penthouse
        puppeteer: {
          getBrowser: () => browser
        }
      };

      let criticalCss = await penthouse(options);

      // Post-processing
      criticalCss = await this._postProcessCss(criticalCss, settings, manifestEntry);

      return criticalCss;
    } catch (e) {
      console.error(`❌ Penthouse error for ${url}:`, e.message);
      return null;
    } finally {
      // Ensure the browser is closed after generation
      if (browser) {
        await browser.close();
      }
    }
  }

  async _postProcessCss(css, settings, manifestEntry) {
    // 1. Unwanted CSS
    const processed = await postcss([
      (root) => {
        if (settings.propertiesRemove?.length) {
          root.walkDecls(decl => { if (settings.propertiesRemove.includes(decl.prop)) decl.remove(); });
        }
        if (settings.selectorsRemove?.length) {
          root.walkRules(rule => { if (settings.selectorsRemove.some(s => rule.selector.includes(s))) rule.remove(); });
        }
        if (this.config.REMOVE_IMPORTANT) {
          root.walkDecls(decl => { decl.important = false; });
        }
        // Remove empty rules
        root.walkRules(rule => { if (!rule.nodes?.length) rule.remove(); });
        root.walkAtRules(at => { if (["media", "supports"].includes(at.name) && !at.nodes?.length) at.remove(); });
      },
      cssnano({ preset: "default" })
    ]).process(css, { parser: postcssSafeParser, from: undefined });

    let finalCss = processed.css;

    // 2. Font Display
    if (this.config.FORCE_FONT_DISPLAY !== false) {
      finalCss = finalCss.replace(/(@font-face\s*{[^}]*?font-family:\s*[^;]+;[^}]*?src:[^}]+?)(;?\s*})/g, (m, b, a) =>
        b.includes("font-display") ? m : b + "; font-display: swap;" + a
      );
    }

    // 3. Fix Asset Paths
    if (manifestEntry.assets?.length) {
      finalCss = finalCss.replace(/url\((\.\/)?([^)"']+)\)/g, (match, dotSlash, assetFile) => {
        const assetPath = manifestEntry.assets.find(a => a.endsWith(assetFile));
        if (assetPath) {
          return `url(${this.relativeViteOutputPath}/${assetPath})`.replace(/\/+/g, "/");
        }
        return match;
      });
    }

    return finalCss;
  }
}

// Run
(async () => {
  const generator = new CriticalCssGenerator();
  await generator.run();
})();
