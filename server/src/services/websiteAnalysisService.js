import { fetchPublicPage, normalizeWebsiteUrl, robotsAllowed, safeInternalUrl } from "./websiteSafeFetch.js";

const PAGE_LIMIT = 20;
const unique = values => [...new Set(values.filter(Boolean))];
const clean = value => String(value || "").replace(/\s+/g, " ").trim();
const decoded = value => String(value || "").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;|&#34;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'").replace(/&#(x[0-9a-f]+|\d+);/gi, (_, x) => {
    const n = x[0] === "x" ? parseInt(x.slice(1),16) : Number(x);
    return n > 31 && n < 0x110000 ? String.fromCodePoint(n) : "";
  });
const plain = value => clean(decoded(String(value || "").replace(/<[^>]*>/g," ")));
function attribute(tag, name) {
  const m = new RegExp("\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i").exec(tag);
  return decoded(m?.[1] ?? m?.[2] ?? m?.[3] ?? "");
}
function meta(html, name) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if ([attribute(tag,"name"),attribute(tag,"property")].some(v => v.toLowerCase()===name))
      return clean(attribute(tag,"content")).slice(0,450);
  }
  return "";
}

export function extractWebsitePage(html, url) {
  const safeHtml = String(html || "").slice(0,600000);
  const body = safeHtml.replace(/<(?:script|style|svg|nav|footer|noscript)\b[^>]*>[\s\S]*?<\/(?:script|style|svg|nav|footer|noscript)>/gi," ");
  const title = plain(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(safeHtml)?.[1]).slice(0,200);
  const headings = unique((body.match(/<h[1-3]\b[^>]*>[\s\S]*?<\/h[1-3]>/gi) || []).map(plain).filter(x=>x.length>=3)).slice(0,22);
  const paragraphs = unique((body.match(/<(?:p|li)\b[^>]*>[\s\S]*?<\/(?:p|li)>/gi)||[])
    .map(plain).filter(x=>x.length>=25&&x.length<=800)).slice(0,25);
  const mainText = plain(body).slice(0,7000);
  const links = (safeHtml.match(/<a\b[^>]*>/gi)||[]).map(x=>attribute(x,"href")).filter(Boolean).slice(0,350);
  const emails = unique([...(mainText.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi)||[]), ...links.filter(x=>x.startsWith("mailto:")).map(x=>x.slice(7).split("?")[0])]
    .filter(x=>x.length<=110&&!/example\.(?:com|org)|wixpress|schema\.org/i.test(x))).slice(0,12);
  const phones = unique([...(mainText.match(/(?:\+?\d[\d()\s.-]{7,}\d)/g)||[]), ...links.filter(x=>x.startsWith("tel:")).map(x=>x.slice(4))]
    .map(clean).filter(x=>{const len=x.replace(/\D/g,"").length;return len>=9&&len<=15;})).slice(0,10);
  const social = unique(links.filter(x=>/(?:facebook\.com|instagram\.com|linkedin\.com|youtube\.com|tiktok\.com|wa\.me|whatsapp\.com)/i.test(x))
    .map(x=>{try{return new URL(x,url).href;}catch{return null;}})).slice(0,15);
  const path=new URL(url).pathname;
  const index=(path+" "+title+" "+headings.slice(0,4).join(" ")).toLowerCase();
  const category=/(?:product|shop|store|collection|catalog|item)/i.test(index)?"product":
    /(?:services?|solutions?|consulting|repair|installation|treatment)/i.test(index)?"service":
    /(?:sale|offers?|promotion|discount|deal)/i.test(index)?"offer":
    /(?:about|company|team|who-we-are)/i.test(index)?"about":
    /(?:contact|location|reach-us)/i.test(index)?"contact":"general";
  const highlights=unique([...headings,...paragraphs]).slice(0,10).map(x=>x.slice(0,240));
  const prices=unique((mainText.match(/(?:USD|LKR|EUR|GBP|AUD|Rs\.?|US\$|\$|€|£)\s?\d[\d,.]*(?:\s?(?:per\s+\w+|\/\w+))?/gi)||[]).map(clean)).slice(0,15);
  const offers=unique(paragraphs.filter(x=>/\b(?:discount|special offer|sale ends|limited time|promo code|save \d+%)\b/i.test(x))).slice(0,6);
  const images=unique((safeHtml.match(/<img\b[^>]*>/gi)||[]).map(x=>{
    const src=attribute(x,"src")||attribute(x,"data-src");
    if(!src)return null;
    try{const dest=new URL(src,url);return ["https:","http:"].includes(dest.protocol)?dest.href:null;}catch{return null;}
  })).slice(0,10);
  return {url,title,description:meta(safeHtml,"description")||meta(safeHtml,"og:description"),
    category,headings,highlights,paragraphs:paragraphs.slice(0,14),prices,offers,emails,phones,social,images,links,
    textPreview:mainText.slice(0,1500)};
}

export function assembleWebsiteReport(url,pages,failures=[]) {
  const first=pages[0];
  const title=first?.headings?.[0]||first?.title||new URL(url).hostname;
  const classified=kind=>pages.filter(x=>x.category===kind).map(p=>({
    title:p.headings[0]||p.title||new URL(p.url).pathname,
    description:p.description||p.paragraphs.slice(0,2).join(" ").slice(0,380),
    prices:p.prices,highlights:p.highlights.slice(0,7),images:p.images.slice(0,5),sourceUrl:p.url
  }));
  const report={url,name:title.slice(0,180),
    description:first?.description||first?.paragraphs?.[0]||"",
    summary:(first?.description||first?.paragraphs?.[0]||"").slice(0,900),
    pages:pages.map(({links,paragraphs,...page})=>page),
    products:classified("product"),services:classified("service"),about:classified("about"),
    contacts:{emails:unique(pages.flatMap(p=>p.emails)).slice(0,25),
      phones:unique(pages.flatMap(p=>p.phones)).slice(0,25),
      social:unique(pages.flatMap(p=>p.social)).slice(0,25),
      sourceUrls:pages.filter(p=>p.emails.length||p.phones.length||p.category==="contact").map(p=>p.url)},
    offers:pages.flatMap(p=>p.offers.map(value=>({text:value,sourceUrl:p.url}))).slice(0,20),
    faq:pages.filter(p=>/faq|frequently-asked/i.test(p.url+" "+p.title))
      .flatMap(p=>p.highlights.slice(0,8).map(value=>({text:value,sourceUrl:p.url}))).slice(0,20),
    pagesScanned:pages.length,failures:failures.slice(0,12),
    limitations:["Only publicly accessible static HTML pages were inspected.",
      "A maximum of 20 pages is scanned; this is not a complete website audit.",
      "Website statements are business-published claims, not independently verified.",
      "Confirm prices, promotions and asset-use permission before publishing."],
    generatedAt:new Date().toISOString()};
  const sources=kind=>report.pages.filter(p=>p.category===kind).slice(0,4).map(p=>p.url);
  const ideas=[{id:"company-introduction",title:"Business introduction",angle:"Introduce the business using its published description, services and value proposition.",evidenceUrls:unique([url,...sources("about")]),durationSeconds:30}];
  if(report.products.length)ideas.push({id:"product-showcase",title:"Product showcase",angle:"Highlight a product, its listed features and an appropriate call to action.",evidenceUrls:sources("product"),durationSeconds:30});
  if(report.services.length)ideas.push({id:"service-explainer",title:"Service explainer",angle:"Explain an offered service, its intended audience and how to enquire.",evidenceUrls:sources("service"),durationSeconds:30});
  if(report.offers.length)ideas.push({id:"verified-offer",title:"Published offer spotlight",angle:"Explain a published offer; confirm availability, conditions and expiration first.",evidenceUrls:unique(report.offers.map(x=>x.sourceUrl)),durationSeconds:15});
  if(report.faq.length)ideas.push({id:"common-questions",title:"Frequently asked questions",angle:"Answer common questions using the business's published information.",evidenceUrls:unique(report.faq.map(x=>x.sourceUrl)),durationSeconds:30});
  report.videoIdeas=ideas.slice(0,5);
  return report;
}

export async function analyzeWebsite(rawUrl,{onProgress=()=>{},fetchPage=fetchPublicPage,deadlineMs=145000}={}) {
  const start=normalizeWebsiteUrl(rawUrl);
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),deadlineMs);timer.unref?.();
  try{
    onProgress(5,"Reading website access rules");
    let robots="";
    let robotsWarning=null;
    try{
      const r=await fetchPage(start.origin+"/robots.txt",{signal:ctrl.signal});
      if(r.type.includes("text/plain")||!r.type)robots=r.text.slice(0,100000);
    }catch(error){
      // RFC 9309 section 2.3.1.3: an HTTP 4xx robots.txt response means
      // the robots rules are unavailable, not that crawling is forbidden.
      // Stay conservative for 429 to respect rate limiting, and never
      // ignore 5xx, DNS, TLS, or timeout failures.
      const httpStatus=Number(error?.status) ||
        Number(/^Website returned HTTP (\d{3})\.$/.exec(String(error?.message||""))?.[1]||0);
      if(httpStatus>=400&&httpStatus<500&&httpStatus!==429){
        if(httpStatus!==404&&httpStatus!==410){
          robotsWarning="robots.txt returned HTTP "+httpStatus+"; no crawl rules were available. Voxora scanned only public pages, without logging in.";
        }
      }else if(httpStatus===429){
        throw new Error("Website robots.txt returned HTTP 429 (rate limited). Retry later.");
      }else if(httpStatus>=500&&httpStatus<600){
        throw new Error("Website robots.txt returned HTTP "+httpStatus+" (server error). Retry after the site recovers.");
      }else{
        // Provide a safe error code, never a raw error string that may
        // accidentally contain request data or credentials.
        const code=String(error?.code||error?.cause?.code||"NETWORK_OR_REDIRECT_FAILURE");
        throw new Error("Website robots.txt could not be checked ("+
          ( /^[A-Z0-9_]{2,50}$/.test(code)?code:"NETWORK_OR_REDIRECT_FAILURE" )+
          "). Check whether the site permits this server to access robots.txt.");
      }
    }
    const queue=[start.href];
    try{
      const sitemap=await fetchPage(start.origin+"/sitemap.xml",{signal:ctrl.signal});
      if(/xml/.test(sitemap.type)){
        for(const loc of sitemap.text.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)){
          const link=safeInternalUrl(decoded(loc[1]),start);
          if(link&&queue.length<75)queue.push(link);
        }
      }
    }catch{/* optional sitemap */}
    const seen=new Set(),pages=[],failures=[];
    while(queue.length&&pages.length<20&&seen.size<55){
      const link=queue.shift();
      if(seen.has(link))continue;
      seen.add(link);
      if(!robotsAllowed(new URL(link).pathname,robots)){
        failures.push({url:link,error:"Excluded by robots.txt"});continue;
      }
      onProgress(10+Math.min(78,Math.round((seen.size/20)*78)),"Inspecting website pages");
      try{
        const response=await fetchPage(link,{signal:ctrl.signal});
        if(!/text\/html|application\/xhtml\+xml/i.test(response.type))continue;
        const page=extractWebsitePage(response.text,response.url);
        if(page.title||page.headings.length||page.paragraphs.length)pages.push(page);
        for(const href of page.links){
          const candidate=safeInternalUrl(href,start);
          if(candidate&&!seen.has(candidate)&&!queue.includes(candidate)&&queue.length<80){
            // Website navigation should outrank long sitemap/blog listings during a bounded scan.
            if(/product|service|offer|pricing|about|contact|shop|collection|faq/i.test(new URL(candidate).pathname))queue.unshift(candidate);
            else queue.push(candidate);
          }
        }
      }catch(error){
        failures.push({url:link,error:ctrl.signal.aborted?"Analysis time limit exceeded":String(error.message).slice(0,140)});
        if(ctrl.signal.aborted)break;
      }
    }
    if(!pages.length)throw new Error("No readable public HTML pages were found. Check the URL and website access rules.");
    onProgress(92,"Preparing website report and video ideas");
    const report=assembleWebsiteReport(start.href,pages,failures);
    if(robotsWarning)report.limitations.push(robotsWarning);
    return report;
  }finally{clearTimeout(timer);}
}
