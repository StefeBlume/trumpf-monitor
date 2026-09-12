const base=process.env.NEXT_PUBLIC_BASE_PATH||'';
export default { reactStrictMode: true, poweredByHeader: false, ...(process.env.STATIC_EXPORT === '1' ? {output:'export',images:{unoptimized:true},...(base?{basePath:base,assetPrefix:base}:{})} : {}) };
