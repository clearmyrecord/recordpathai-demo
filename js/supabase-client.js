(function () {
  "use strict";

  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const CONFIG_ENDPOINT = "/api/config/supabase";
  const MISSING_CONFIG_MESSAGE = "Supabase public configuration is missing. Add RECORDPATH_SUPABASE_URL and RECORDPATH_SUPABASE_ANON_KEY or SUPABASE_URL and SUPABASE_ANON_KEY.";

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
      const response = await fetch(CONFIG_ENDPOINT, { credentials: "same-origin" });
      if (!response.ok) return {};
      return await response.json();
    } catch (error) {
      lastConfigError = error;
      console.warn("Supabase config endpoint unavailable:", error);
      return {};
    }
  }

  async function getConfig() {
    if (!configPromise) {
      configPromise = (async function () {
        const windowConfig = fromWindowConfig();
        const metaConfig = fromMetaConfig();
        const serverConfig = await fetchServerConfig();
        cachedConfig = {
          url: windowConfig.url || metaConfig.url || serverConfig.url || serverConfig.supabaseUrl || "",
          anonKey: windowConfig.anonKey || metaConfig.anonKey || serverConfig.anonKey || serverConfig.supabaseAnonKey || ""
        };
        return cachedConfig;
      }());
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
        script.onload = function () { libraryLoaded = Boolean(window.supabase && window.supabase.createClient); resolve(window.supabase); };
        script.onerror = function () { reject(new Error("Could not load Supabase client library.")); };
        document.head.appendChild(script);
      }).catch(function (error) {
        lastClientError = error;
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
