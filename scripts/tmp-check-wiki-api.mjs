import axios from 'axios';

const url = 'https://en.wikipedia.org/w/api.php?action=parse&page=List_of_constituencies_of_the_Tamil_Nadu_Legislative_Assembly&prop=wikitext&format=json&formatversion=2';

try {
  const response = await axios.get(url, {
    timeout: 60000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    },
  });

  console.log(JSON.stringify({
    keys: Object.keys(response.data || {}),
    hasParse: !!response.data?.parse,
    wikitextLength: (response.data?.parse?.wikitext || '').length,
  }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
