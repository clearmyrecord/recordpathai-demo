(function () {
  "use strict";

  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const CONFIG_ENDPOINT = "/api/config/supabase";
  const MISSING_CONFIG_MESSAGE = "Account sign-in is temporarily unavailable because the authentication service is not configured. Please contact RecordPathAI support; your saved information has not been deleted.";

  let configPromise;
  let libraryPromise;
  let clientPromise;
  let cachedClient = null;
  let cachedConfig = null;
  let lastConfigError = null;
  let lastClientError = null;
  let libraryLoaded = Boolean(window.supabase && window.supabase.createClient);

  function fromWindowConfig() {
    return {
      url: window.RECORDPATH_SUPABASE_URL || window.SUPABASE_URL || "",
      anonKey: window.RECORDPATH_SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY || ""
    };
  }

  function fromMetaConfig() {
    const url = document.querySelector('meta[name="supabase-url"]');
    const anonKey = document.querySelector('meta[name="supabase-anon-key"]');
    return {
      url: url ? url.getAttribute("content") : "",
      anonKey: anonKey ? anonKey.getAttribute("content") : ""
    };
  }

  async function fetchServerConfig() {
    try {
      const response = await fetch(CONFIG_ENDPOINT, {
        credentials: "same-origin",
        cache: "no-store"
      });
      if (!response.ok) {
        lastConfigError = new Error("Authentication configuration service returned HTTP " + response.status);
        return {};
      }
      const config = await response.json();
      if (!config || !config.url || !(config.anonKey || config.supabaseAnonKey)) {
        lastConfigError = new Error("Authentication configuration endpoint did not supply complete public settings.");
        return {};
      }
      lastConfigError = null;
      return config;
    } catch (error) {
      lastConfigError = error;
      console.warn("Supabase config endpoint unavailable:", error.message);
      return {};
    }
  }

  async function getConfig() {
    if (cachedConfig && cachedConfig.url && cachedConfig.anonKey) return cachedConfig;
    if (!configPromise) {
      configPromise = (async function () {
        const serverConfig = await fetchServerConfig();
        const windowConfig = fromWindowConfig();
        const metaConfig = fromMetaConfig();
        // URL and public key must come from the same source. Mixing them can
        // silently authenticate against an unrelated Supabase project.
        const sources = [
          { url: serverConfig.url || serverConfig.supabaseUrl, anonKey: serverConfig.anonKey || serverConfig.supabaseAnonKey },
          windowConfig, metaConfig
        ];
        const config = sources.find(function (item) { return item.url && item.anonKey; }) || { url: "", anonKey: "" };
        cachedConfig = { url: String(config.url || "").trim(), anonKey: String(config.anonKey || "").trim() };
        if (!cachedConfig.url || !cachedConfig.anonKey) {
          configPromise = null; // Do not cache a transient outage indefinitely.
        }
        return cachedConfig;
      }()).catch(function (error) {
        configPromise = null;
        throw error;
      });
    }
    return configPromise;
  }

  function loadLibrary() {
    if (window.supabase && window.supabase.createClient) {
      libraryLoaded = true;
      return Promise.resolve(window.supabase);
    }
    if (!libraryPromise) {
      libraryPromise = new Promise(function (resolve, reject) {
        const existing = document.querySelector('script[data-recordpath-supabase-js="true"]');
        if (existing) {
          existing.addEventListener("load", function () { libraryLoaded = Boolean(window.supabase && window.supabase.createClient); resolve(window.supabase); });
          existing.addEventListener("error", reject);
          return;
        }
        const script = document.createElement("script");
        script.src = SUPABASE_JS_URL;
        script.async = true;
        script.defer = true;
        script.dataset.recordpathSupabaseJs = "true";
        let settled = false;
        const timeout = setTimeout(function () {
          if (settled) return;
          settled = true;
          script.remove();
          reject(new Error("The authentication library timed out. Check your connection and try again."));
        }, 12000);
        script.onload = function () {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          libraryLoaded = Boolean(window.supabase && window.supabase.createClient);
          if (libraryLoaded) resolve(window.supabase);
          else reject(new Error("The authentication library did not initialize."));
        };
        script.onerror = function () {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          script.remove();
          reject(new Error("Could not load the authentication library. Check your connection and try again."));
        };
        document.head.appendChild(script);
      }).catch(function (error) {
        lastClientError = error;
        libraryPromise = null; // retry after a temporary CDN/network failure
        throw error;
      });
    }
    return libraryPromise;
  }

  async function getClient() {
    if (cachedClient) return cachedClient;
    if (!clientPromise) {
      clientPromise = (async function () {
        const config = await getConfig();
        if (!config.url || !config.anonKey) {
          lastClientError = new Error(MISSING_CONFIG_MESSAGE);
          lastClientError.code = "supabase_config_missing";
          throw lastClientError;
        }
        const supabaseLibrary = await loadLibrary();
        if (!supabaseLibrary || !supabaseLibrary.createClient) throw new Error("Supabase client library did not initialize.");
        cachedClient = supabaseLibrary.createClient(config.url, config.anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        });
        return cachedClient;
      }()).catch(function (error) {
        lastClientError = error;
        clientPromise = null;
        throw error;
      });
    }
    return clientPromise;
  }

  async function getDiagnostics() {
    const config = await getConfig();
    return {
      configLoaded: Boolean(config.url && config.anonKey),
      clientLoaded: Boolean(cachedClient || (window.supabase && window.supabase.createClient)),
      libraryLoaded: Boolean(libraryLoaded || (window.supabase && window.supabase.createClient)),
      configEndpoint: CONFIG_ENDPOINT,
      configError: lastConfigError ? lastConfigError.message : "",
      clientError: lastClientError ? lastClientError.message : ""
    };
  }

  window.RecordPathSupabase = {
    getConfig,
    getClient,
    getDiagnostics,
    missingConfigMessage: MISSING_CONFIG_MESSAGE,
    isConfigured: async function () {
      const config = await getConfig();
      return Boolean(config.url && config.anonKey);
    },
    ready: getClient().catch(function (error) {
      console.warn(error.message);
      return null;
    })
  };
}());
