import puppeteer from "puppeteer-core";
import penthouse from "penthouse";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import minimist from "minimist";
import postcss from "postcss";
import postcssSafeParser from "postcss-safe-parser";
import cssnano from "cssnano";

class CriticalCssGenerator {
  constructor() {
    this._loadConfig();
    this._loadEnv();
    this._loadManifest();
    this._loadSiteConfig();
    this._getManifestEntry();
    this._getHashFromManifestEntry();
  }

  _loadConfig() {
    try {
      this.config = {};
      const YAML_CONFIG_PATH = "critical.yaml";
      if (fs.existsSync(YAML_CONFIG_PATH)) {
        this.config = yaml.load(fs.readFileSync(YAML_CONFIG_PATH, "utf8"));
        console.log(`✅ Loaded configuration from ${YAML_CONFIG_PATH}`);

        console.log(this.config);
      } else {
        console.error(`❌ Error: ${YAML_CONFIG_PATH} not found!`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Error loading YAML configuration (${YAML_CONFIG_PATH}):`, error);
      process.exit(1);
    }
  }

  /**
   * Load environment variables from critical.env
   */
  _loadEnv() {
    const args = minimist(process.argv.slice(2));
    this.sitename = args.site || this.config.SITENAME;
    this.template = args.template || this.config.TEMPLATE;
    this.env = args.env || this.config.ENV || "Development";

    this.absoluteViteOutputPath = args.outputpath || this.config.VITE_OUTPUT_PATH || "public/assets/";
    this.relativeViteOutputPath = this.absoluteViteOutputPath.replace(/^public\//, "");

    if (!this.sitename || !this.template) {
      console.error("❌ `SITENAME` and `TEMPLATE` are required! Set them via CLI or `critical.yaml`.");
      process.exit(1);
    }
    console.log(`🛠️  Using SITENAME: ${this.sitename}, TEMPLATE: ${this.template}, ENV: ${this.env}`);
    if (!args.env && !this.config.ENV) {
      console.warn("⚠️ No `ENV` specified! Defaulting to `Development`.");
    }
  }

  /**
   * Load Vite manifest.json
   */
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

  /**
   * Load site-specific config.yaml
   */
  _loadSiteConfig() {
    const configPath = path.join("config", 'sites', this.sitename, "config.yaml");
    if (!fs.existsSync(configPath)) {
      console.warn(`⚠️ No config.yaml found for site: ${this.sitename}`);
      process.exit(1);
    } else {
      console.log(`✅ Loaded Site Config  from ${configPath}`);
    }

    try {
      this.siteConfig = yaml.load(fs.readFileSync(configPath, "utf8"));
      const baseVariant = this.siteConfig.baseVariants?.find(v => v.condition.includes(this.env));
      this.baseUrl = baseVariant?.base || this.siteConfig.base;

      console.log(`🌍 Base URL: ${this.baseUrl}`);

      if (!this.siteConfig.viteCritical?.criticalCss?.enable) {
        console.warn("⚠️ Critical CSS is disabled in the site configuration!");
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Error loading site configuration (${configPath}):`, error);
      process.exit(1);
    }
  }

  _getManifestEntry() {
    this.manifestEntry = Object.values(this.manifest).find(item => item.name === `${this.sitename}_${this.template}`);
    if (!this.manifestEntry) {
      console.error(`❌ No matching entry found for ${this.sitename}_${this.template} in the Vite manifest.`);
      process.exit(1);
    }
  }

  _getHashFromManifestEntry() {
    // Extract Hash from the filename (assuming format: "assets/SITENAME_TEMPLATE-CtisGtDw.css|js")
    const hashMatch = this.manifestEntry.file ? this.manifestEntry.file.match(/-(\w+)\.(css|js)$/) : null;
    this.fileHash = hashMatch ? hashMatch[1] : null;

    if (this.fileHash) {
      console.log(`✅ Extracted file hash: ${this.fileHash}`);
    } else {
      console.warn(`⚠️ No hash found for ${this.sitename}_${this.template}`);
    }
  }

  /**
   * Get the correct CSS files and extract hash for the given template from manifest.json
   */
  _getCssFileFromManifest() {
    try {
      // Extract CSS files
      let cssFiles = this.manifestEntry.css || [];
      if (this.manifestEntry.file && this.manifestEntry.file.endsWith(".css")) {
        cssFiles.push(this.manifestEntry.file);
      }

      return cssFiles.map(file => path.join(this.absoluteViteOutputPath, file));
    } catch (error) {
      console.error("❌ Error loading Vite manifest:", error);
      process.exit(1);
    }
  }

  _fixAssetPathsInCriticalCss(criticalCss) {
    if (!this.manifestEntry || !this.manifestEntry.assets) {
      console.info("ℹ️ Keine Assets im Manifest gefunden. Pfade werden nicht angepasst.");
      return criticalCss;
    }

    return criticalCss.replace(/url\((\.\/)?([^)"']+)\)/g, (match, dotSlash, assetFile) => {
      const assetPath = this.manifestEntry.assets.find(asset => asset.endsWith(assetFile));

      if (assetPath) {
        // Korrigiere doppelte Slashes und stelle sicher, dass es mit / beginnt
        let fixedPath = `${this.relativeViteOutputPath}/${assetPath}`.replace(/\/+/g, "/");

        return `url(${fixedPath})`;
      }

      return match; // Falls das Asset nicht gefunden wird, bleibt es unverändert
    });
  }

  /**
   * Start Puppeteer and extract Critical CSS
   */
  /**
   * Generate Critical CSS using Penthouse and Puppeteer
   */
  async generateCriticalCss() {
    console.log("🚀 Starting Puppeteer...");

    // Load Puppeteer arguments from config
    const browserArgs = this.config.PUPPETEER_ARGS || [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--ignore-certificate-errors",
      "--allow-insecure-localhost"
    ];

    // Start Puppeteer
    const browser = await puppeteer.launch({
      headless: "new",
      executablePath: "/usr/bin/chromium",
      args: browserArgs
    });

    const page = await browser.newPage();
    console.log(`🌐 Loading page: ${this.baseUrl}`);
    await page.goto(this.baseUrl, { waitUntil: "networkidle2" });

    console.log("✅ Page loaded, retrieving CSS...");

    // Retrieve all CSS files from manifest
    const cssFiles = this._getCssFileFromManifest();
    if (!cssFiles || cssFiles.length === 0) {
      console.error("❌ No CSS files found for template!");
      await browser.close();
      return;
    }

    // Inject all CSS files into the page
    for (const cssFile of cssFiles) {
      console.log(`🔗 Injecting CSS: ${cssFile}`);
      const cssContent = fs.readFileSync(cssFile, "utf-8");
      await page.addStyleTag({ content: cssContent });
    }

    console.log("🚀 Extracting Critical CSS...");

    // Extract Critical CSS using Penthouse
    let options = {
      url: this.baseUrl,
      puppeteer: {
        getBrowser: async () => {
          console.log("🚀 Starting Puppeteer for Penthouse...");
          return await puppeteer.launch({
            executablePath: "/usr/bin/chromium",
            headless: "new",
            args: browserArgs
          });
        }
      },
      width: parseInt(this.config.WIDTH,10),
      height: parseInt(this.config.HEIGHT, 10),
      forceInclude: this.config.FORCE_INCLUDE || [],
      blockJSRequests: this.config.BLOCK_JS_REQUESTS !== false,
      renderWaitTime: parseInt(this.config.RENDER_WAIT_TIME || "300", 10),
      timeout: parseInt(this.config.TIMEOUT || "30000", 10),
      stripComments: this.config.STRIP_COMMENTS !== false,
      maxEmbeddedBase64Length: parseInt(this.config.MAX_BASE64_LENGTH || "1000", 10),
      propertiesToRemove: this.config.PROPERTIES_REMOVE || []
    }
    options.cssString = cssFiles.map(file => fs.readFileSync(file, "utf-8")).join("\n");

    let criticalCss = await penthouse(options);
    criticalCss = this._removeUnwantedCss(criticalCss);
    console.log("✅ Critical CSS extracted!");

    if (this.config.FORCE_FONT_DISPLAY !== false) {
      criticalCss = this._forceFontDisplay(criticalCss);
      console.log(`✅ Force font-display ${this.config.FORCE_FONT_DISPLAY}!`);
    }

    criticalCss = this._fixAssetPathsInCriticalCss(criticalCss);

    // minify critical css
    const minifiedCriticalCss = await postcss([
      cssnano({
        preset: "default",
      })
    ]).process(criticalCss, { parser: postcssSafeParser });
    criticalCss = minifiedCriticalCss.css;
    console.log("✅ Critical CSS minified!");

    this._saveCriticalCss(criticalCss);
    await this._generateDeferredCss(criticalCss);

    this.manifestEntry.critical = path.join(this.relativeViteOutputPath, `${this.sitename}_${this.template}-critical-${this.fileHash}.css`);
    this.manifestEntry.deferred = path.join(this.relativeViteOutputPath, `${this.sitename}_${this.template}-deferred-${this.fileHash}.css`);
    fs.writeFileSync(this.manifestPath, JSON.stringify(this.manifest, null, 2));

    console.log("✅ manifest.json updated successfully!");

    await browser.close();
  }

  /**
   * Remove unwanted CSS properties and selectors safely while maintaining valid CSS syntax.
   */
  _removeUnwantedCss(cssContent) {
    console.log("🔍 Removing unwanted CSS properties, selectors, and !important safely...");

    try {
      const processedCss = postcss([
        (root) => {
          // ✅ Entferne definierte Properties
          if (this.config.PROPERTIES_REMOVE && Array.isArray(this.config.PROPERTIES_REMOVE)) {
            console.log("🔍 Properties to remove:", this.config.PROPERTIES_REMOVE);
            root.walkDecls(decl => {
              if (this.config.PROPERTIES_REMOVE.includes(decl.prop)) {
                console.log(`🗑 Removing property: ${decl.prop} in selector: ${decl.parent.selector}`);
                decl.remove();
              }
            });
          }

          // ✅ Entferne bestimmte Selektoren
          if (this.config.SELECTORS_REMOVE && Array.isArray(this.config.SELECTORS_REMOVE)) {
            console.log("🔍 Selectors to remove:", this.config.SELECTORS_REMOVE);
            root.walkRules(rule => {
              if (this.config.SELECTORS_REMOVE.some(selector => rule.selector.includes(selector))) {
                console.log(`🗑 Removing entire selector: ${rule.selector}`);
                rule.remove();
              }
            });
          }

          // ✅ Entferne `!important` falls aktiviert
          if (this.config.REMOVE_IMPORTANT === true) {
            console.log("🔍 Removing !important from all CSS properties...");
            root.walkDecls(decl => {
              if (decl.important) {
                console.log(`🗑 Removing !important from: ${decl.prop} in selector: ${decl.parent.selector}`);
                decl.important = false; // Entferne `!important` direkt
              }
            });
          }

          // ✅ Entferne leere Selektoren
          root.walkRules(rule => {
            if (!rule.nodes || rule.nodes.length === 0) {
              console.log(`🗑 Removing empty rule: ${rule.selector}`);
              rule.remove();
            }
          });

          // ✅ Entferne leere Media Queries
          root.walkAtRules(atRule => {
            if (atRule.name === "media" && (!atRule.nodes || atRule.nodes.length === 0)) {
              console.log(`🗑 Removing empty @media query: ${atRule.params}`);
              atRule.remove();
            }
          });

          // ✅ Entferne leere @supports Blöcke
          root.walkAtRules(atRule => {
            if (atRule.name === "supports" && (!atRule.nodes || atRule.nodes.length === 0)) {
              console.log(`🗑 Removing empty @supports block: ${atRule.params}`);
              atRule.remove();
            }
          });
        }
      ]).process(cssContent, { parser: postcssSafeParser }).css;

      return processedCss;
    } catch (error) {
      console.error("❌ Error processing CSS removal:", error);
      return cssContent; // Falls ein Fehler auftritt, gib das Original zurück
    }
  }

  _forceFontDisplay(criticalCss) {
    return criticalCss.replace(
      /(@font-face\s*{[^}]*?font-family:\s*[^;]+;[^}]*?src:[^}]+?)(;?\s*})/g,
      (match, before, after) => {
        return before.includes("font-display")
          ? match.replace(/font-display:\s*swap(?!;)/, "font-display: swap;")
          : before + "; font-display: swap;" + after;
      }
    );
  }

  /**
   * Generate Deferred CSS by removing Critical CSS from the original CSS files.
   */
  async _generateDeferredCss(criticalCss) {
    console.log("🚀 Generating Deferred CSS using PostCSS...");

    if (!this.manifestEntry) {
      console.error("❌ No valid manifest entry found!");
      return null;
    }

    const cssFiles = [...(this.manifestEntry.css || []), this.manifestEntry.file]
      .filter(Boolean)
      .map(file => path.join(this.absoluteViteOutputPath, file));

    let deferredCss = "";

    try {
      // Load original CSS files
      let combinedOriginalCss = "";
      for (const cssFile of cssFiles) {
        if (fs.existsSync(cssFile)) {
          console.log(`🔗 Adding original CSS file: ${cssFile}`);
          combinedOriginalCss += fs.readFileSync(cssFile, "utf-8") + "\n";
        } else {
          console.warn(`⚠️ CSS file not found: ${cssFile}`);
        }
      }

      // Process with PostCSS
      console.log("🧹 Removing Critical CSS from Deferred CSS with PostCSS...");
      const criticalAst = postcss.parse(criticalCss);
      const originalAst = postcss.parse(combinedOriginalCss);

      // Remove Critical CSS rules from the original CSS
      criticalAst.walkRules(rule => {
        originalAst.walkRules(origRule => {
          if (origRule.selector === rule.selector) {
            //console.log(`❌ Removing selector from deferred: ${rule.selector}`);
            origRule.remove();
          }
        });
      });

      // Remove empty selectors, media queries, and @supports blocks
      originalAst.walkRules(rule => {
        if (!rule.nodes || rule.nodes.length === 0) {
          console.log(`🗑 Removing empty rule: ${rule.selector}`);
          rule.remove();
        }
      });

      originalAst.walkAtRules(atRule => {
        if (["media", "supports"].includes(atRule.name) && (!atRule.nodes || atRule.nodes.length === 0)) {
          console.log(`🗑 Removing empty @${atRule.name} block: ${atRule.params}`);
          atRule.remove();
        }
      });

      // Convert back to CSS
      const processedCss = await postcss([
        cssnano({
          preset: "default",
        })
      ]).process(originalAst.toString(), { parser: postcssSafeParser });

      const deferredCss = processedCss.css;
      console.log("📏 Deferred CSS length after minification:", deferredCss.length);

      // Save the Deferred CSS file
      const deferredCssFilename = `${this.sitename}_${this.template}-deferred-${this.fileHash}.css`;
      const deferredCssPath = path.join(this.absoluteViteOutputPath, "assets", deferredCssFilename);

      fs.writeFileSync(deferredCssPath, deferredCss);
      console.log(`✅ Deferred CSS saved to ${deferredCssPath}`);

      return deferredCssFilename;
    } catch (error) {
      console.error("❌ Error generating Deferred CSS:", error);
      return null;
    }
  }

  /**
   * Save the generated Critical CSS
   */
  _saveCriticalCss(criticalCss) {
    const outputPath = path.join(this.absoluteViteOutputPath, 'assets', `${this.sitename}_${this.template}-critical-${this.fileHash}.css`);
    fs.writeFileSync(outputPath, criticalCss);
    console.log(`✅ Critical CSS saved to ${outputPath}`);
  }
}

// Execute the script
(async () => {
  const generator = new CriticalCssGenerator();
  await generator.generateCriticalCss();
})();
