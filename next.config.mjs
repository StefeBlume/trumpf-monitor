export default { reactStrictMode: true, poweredByHeader: false, ...(process.env.MOBILE_EXPORT === '1' ? {output:'export',images:{unoptimized:true}} : {}) };
