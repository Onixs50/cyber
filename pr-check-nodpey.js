const fs = require('fs');
const axios = require('axios');

const PROXY_SOURCES = [
  {
    url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
    type: 'http'
  },
  {
    url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt',
    type: 'socks4'
  },
  {
    url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt',
    type: 'socks5'
  }
];

async function formatProxies() {
  let formattedProxies = [];
  
  for (const source of PROXY_SOURCES) {
    try {
      console.log(`Fetching ${source.type} proxies...`);
      const response = await axios.get(source.url);
      const proxyList = response.data.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
        .map(line => {
          const [host, port] = line.split(':');
          // Convert to format that original bot expects, but with empty username:password
          return `${host}:${port}::`;
        });
      
      formattedProxies.push(...proxyList);
      console.log(`✅ Added ${proxyList.length} ${source.type} proxies`);
    } catch (error) {
      console.log(`❌ Failed to fetch ${source.type} proxies: ${error.message}`);
    }
  }

  // Shuffle the proxies for better distribution
  formattedProxies = formattedProxies.sort(() => Math.random() - 0.5);
  
  // Take only the first 50 proxies (or adjust as needed)
  formattedProxies = formattedProxies.slice(0, 50);
  
  // Write to proxy.txt
  fs.writeFileSync('proxy.txt', formattedProxies.join('\n'));
  console.log(`\n✅ Successfully wrote ${formattedProxies.length} proxies to proxy.txt`);
}

// Run the formatter
console.log('🔄 Starting proxy formatting...\n');
formatProxies().catch(console.error);
