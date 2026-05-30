(function () {
  "use strict";

  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const CONFIG_ENDPOINT = "/api/config/supabase";

  let configPromise;
  let libraryPromise;
  let clientPromise;
  let cachedClient = null;
  let cachedConfig = null;

  function fromWindowConfig() {
    return {
      url: window.RECORDPATH_SUPABASE_URL || "",
      anonKey: window.RECORDPATH_SUPABASE_ANON_KEY || ""
    };
  }

  async function fetchServerConfig() {
    try {
      const response = await fetch(CONFIG_ENDPOINT, { credentials: "same-origin" });
      if (!response.ok) return {};
      return await response.json();
    } catch (error) {
      console.warn("Supabase config endpoint unavailable:", error);
      return {};
    }
  }

  async function getConfig() {
    if (!configPromise) {
      configPromise = (async function () {
        const windowConfig = fromWindowConfig();
        if (windowConfig.url && windowConfig.anonKey) {
          cachedConfig = windowConfig;
          return cachedConfig;
        }

        const serverConfig = await fetchServerConfig();
        cachedConfig = {
          url: windowConfig.url || serverConfig.url || "",
          anonKey: windowConfig.anonKey || serverConfig.anonKey || ""
        };
        return cachedConfig;
      }());
    }
    return configPromise;
  }

  function loadLibrary() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
    if (!libraryPromise) {
      libraryPromise = new Promise(function (resolve, reject) {
        const existing = document.querySelector('script[data-recordpath-supabase-js="true"]');
        if (existing) {
          existing.addEventListener("load", function () { resolve(window.supabase); });
          existing.addEventListener("error", reject);
          return;
        }
        const script = document.createElement("script");
        script.src = SUPABASE_JS_URL;
        script.async = true;
        script.defer = true;
        script.dataset.recordpathSupabaseJs = "true";
        script.onload = function () { resolve(window.supabase); };
        script.onerror = function () { reject(new Error("Could not load Supabase client library.")); };
        document.head.appendChild(script);
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
          throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in the deployment environment.");
        }
        const supabaseLibrary = await loadLibrary();
        cachedClient = supabaseLibrary.createClient(config.url, config.anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        });
        return cachedClient;
      }());
    }
    return clientPromise;
  }

  window.RecordPathSupabase = {
    getConfig,
    getClient,
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
