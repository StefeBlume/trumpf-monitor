import type {AppProps} from 'next/app';import '../src/ui/style.css';
export default function App({Component,pageProps}:AppProps){return <Component {...pageProps}/>;}
