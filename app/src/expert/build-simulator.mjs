// One definition for the app (srcdoc) and the build step that hashes it for CSP.
export const buildSimulator=(template,version,market)=>template.replaceAll('__EXPERT_VERSION__',version).replace('/* SHARED_DEMO_MARKET */',market.replace(/^export /gm,''))
