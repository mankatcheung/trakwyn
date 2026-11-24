/**
 * The two inline scripts in the document head (JEF-685).
 *
 * They live here, with no imports beyond `localePaths.ts`, because
 * `vite.config.ts` hashes them for the Content-Security-Policy and a config
 * file cannot resolve the `#/` alias or load React. `theme.tsx` and `i18n.tsx`
 * re-export them under their old names.
 */
import { LOCALE_PATH_PREFIX, LOCALE_QUERY_KEY } from './localePaths';

export const THEME_STORAGE_KEY = 'theme';
export const LOCALE_STORAGE_KEY = 'locale';

// Inlined into the document head so the theme is applied before hydration
// and before first paint, avoiding a flash of the wrong theme.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var d=t==='dark'||((t==='system'||!t)&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

/**
 * Sets `<html lang>` before hydration. The path prefix is checked first, so a
 * `/zh-hk/…` page is not relabelled with the visitor's stored or browser
 * language while it waits for JavaScript.
 *
 * It still reads `?locale=`, though the app no longer writes one (JEF-654): it
 * runs before `adoptLocaleFromQuery` has moved an old link's language into
 * storage, so the first paint of such a link is labelled correctly.
 */
export const LOCALE_INIT_SCRIPT = `(function(){try{var m=${JSON.stringify(LOCALE_PATH_PREFIX)};var s=location.pathname.split('/')[1];var f=null;for(var k in m){if(m[k]===s){f=k}}var p=new URLSearchParams(location.search).get('${LOCALE_QUERY_KEY}');var l=f||p||localStorage.getItem('${LOCALE_STORAGE_KEY}')||((navigator.languages||[])[0])||'en';document.documentElement.lang=l;}catch(e){}})();`;
