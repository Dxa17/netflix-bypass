(function() {
  'use strict';

  // === SPOOF USER AGENT ===
  var FAKE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  Object.defineProperty(navigator, 'userAgent', { get: function() { return FAKE_UA; } });
  Object.defineProperty(navigator, 'platform', { get: function() { return 'Win32'; } });
  Object.defineProperty(navigator, 'vendor', { get: function() { return 'Google Inc.'; } });
  Object.defineProperty(navigator, 'languages', { get: function() { return ['en-US', 'en']; } });

  // === SPOOF SCREEN ===
  Object.defineProperty(screen, 'width', { get: function() { return 1920; } });
  Object.defineProperty(screen, 'height', { get: function() { return 1080; } });
  Object.defineProperty(screen, 'availWidth', { get: function() { return 1920; } });
  Object.defineProperty(screen, 'availHeight', { get: function() { return 1040; } });
  Object.defineProperty(screen, 'colorDepth', { get: function() { return 24; } });
  Object.defineProperty(screen, 'pixelDepth', { get: function() { return 24; } });

  // === SPOOF MEDIA CAPABILITIES ===
  if (navigator.mediaCapabilities) {
    var origDecodingInfo = navigator.mediaCapabilities.decodingInfo.bind(navigator.mediaCapabilities);
    navigator.mediaCapabilities.decodingInfo = function(config) {
      return Promise.resolve({
        supported: true,
        smooth: true,
        powerEfficient: false,
        durability: 'not-tolerant',
        playbackInfo: {
          supported: true,
          smooth: true,
          powerEfficient: false
        }
      });
    };
  }

  // === SPOOF MediaSource ===
  if (typeof window.MediaSource === 'undefined') {
    window.MediaSource = function() {};
    window.MediaSource.isTypeSupported = function() { return true; };
  } else {
    var origIsTypeSupported = MediaSource.isTypeSupported.bind(MediaSource);
    MediaSource.isTypeSupported = function() { return true; };
  }

  // === SPOOF DRM / WIDEVINE ===
  var origRequestMediaKeySystemAccess = navigator.requestMediaKeySystemAccess;
  navigator.requestMediaKeySystemAccess = function(keySystem, configs) {
    var enhancedConfigs = configs.map(function(config) {
      var enhanced = JSON.parse(JSON.stringify(config));
      if (enhanced.videoCapabilities) {
        enhanced.videoCapabilities.forEach(function(vc) {
          vc.robustness = vc.robustness || 'HW_SECURE_ALL';
        });
      }
      if (enhanced.audioCapabilities) {
        enhanced.audioCapabilities.forEach(function(ac) {
          ac.robustness = ac.robustness || 'HW_SECURE_ALL';
        });
      }
      return enhanced;
    });

    return origRequestMediaKeySystemAccess.call(navigator, keySystem, enhancedConfigs).catch(function() {
      return origRequestMediaKeySystemAccess.call(navigator, keySystem, configs);
    });
  };

  // === SPOOF HARDWARE CONCURRENCY ===
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: function() { return 8; } });
  Object.defineProperty(navigator, 'deviceMemory', { get: function() { return 8; } });

  // === BLOCK NETFLIX CLCSInterstitial ===
  var OPERATION_MARKER = '"operationName":"CLCSInterstitial"';
  var BLOCKED_DOMAINS = [
    'web.prod.cloud.netflix.com',
    'prod.cloud.netflix.com'
  ];

  function shouldBlock(url, body) {
    var domainBlocked = BLOCKED_DOMAINS.some(function(d) { return url && url.indexOf(d) !== -1; });
    var opBlocked = body && body.indexOf(OPERATION_MARKER) !== -1;
    return domainBlocked || opBlocked;
  }

  function getBodyString(body) {
    if (!body) return '';
    if (typeof body === 'string') return body;
    try { return JSON.stringify(body); } catch(e) { return ''; }
  }

  var origFetch = window.fetch;
  window.fetch = function(input, init) {
    var url = typeof input === 'string' ? input : (input && input.url);
    var method = (init && init.method || 'GET').toUpperCase();
    if (method === 'POST') {
      var bodyStr = getBodyString(init && init.body);
      if (shouldBlock(url, bodyStr)) {
        console.log('[Netflix Bypass] Blocked: ' + url);
        return Promise.resolve(new Response('{}', { status: 200 }));
      }
    }
    return origFetch.apply(this, arguments);
  };

  var OrigXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    var xhr = new OrigXHR();
    var _method = 'GET';
    var _url = '';
    var origOpen = xhr.open;
    var origSend = xhr.send;
    xhr.open = function(method, url) {
      _method = (method || 'GET').toUpperCase();
      _url = url;
      return origOpen.apply(this, arguments);
    };
    xhr.send = function(data) {
      if (_method === 'POST' && shouldBlock(_url, getBodyString(data))) {
        console.log('[Netflix Bypass] Blocked XHR: ' + _url);
        try { this.abort(); } catch(e) {}
        return;
      }
      return origSend.apply(this, arguments);
    };
    return xhr;
  }
  window.XMLHttpRequest = PatchedXHR;
  Object.setPrototypeOf(window.XMLHttpRequest, OrigXHR);
  window.XMLHttpRequest.prototype = OrigXHR.prototype;

  // === REMOVE NETFLIX BLOCK MODALS ===
  var observer = new MutationObserver(function() {
    var selectors = ['.nf-modal', '[class*="interstitial"]', '[class*="household"]', '[class*="update-required"]', '[class*="browser-update"]'];
    selectors.forEach(function(sel) {
      document.querySelectorAll(sel).forEach(function(el) { el.remove(); });
    });
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  console.log('[Netflix Bypass] Module loaded with full spoofing');
})();
