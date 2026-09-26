const http = require('http');

function sendPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path: path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let resData = '';
        res.on('data', (chunk) => (resData += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(resData) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: resData });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('=== STARTING MONDAY AUTONOMOUS AGENT VERIFICATION ===\n');

  const testCases = [
    {
      title: '1. Meta Skill Query ("what skills have you learned")',
      prompt: 'what skills have you learned',
      validate: (res) => res.body.response && res.body.response.includes('skills'),
    },
    {
      title: '2. Learned Skill Execution ("check disk space")',
      prompt: 'check disk space',
      validate: (res) => res.body.response && (res.body.response.includes('FreeGB') || res.body.response.includes('Drive') || res.body.response.includes('Disk Space')),
    },
    {
      title: '3. Learned Skill Execution ("what are my top memory processes")',
      prompt: 'what are my top memory processes',
      validate: (res) => res.body.response && (res.body.response.includes('RAM') || res.body.response.includes('Memory') || res.body.response.includes('Process')),
    },
    {
      title: '4. Dynamic Heuristic Synthesis ("check my ip address")',
      prompt: 'check my ip address',
      validate: (res) => res.body.response && (res.body.response.includes('IP') || res.body.response.includes('Address') || res.body.response.includes('192.') || res.body.response.includes('10.') || res.body.response.includes('127.')),
    },
    {
      title: '5. Unbounded Web Research ("what is google project astra")',
      prompt: 'what is google project astra',
      validate: (res) => res.body.response && res.body.response.length > 20,
    },
  ];

  let passed = 0;
  for (const tc of testCases) {
    process.stdout.write(`Testing: ${tc.title}... `);
    try {
      const res = await sendPost('/api/chat', { prompt: tc.prompt });
      const respText = res.body?.response || '';
      const bossMatches = (respText.match(/Boss/gi) || []).length;
      const isValid = tc.validate(res);

      if (isValid && bossMatches >= 1) {
        console.log('PASSED!');
        console.log(`   -> Output: "${respText.replace(/\n/g, ' ')}"`);
        console.log(`   -> Boss count: ${bossMatches}\n`);
        passed++;
      } else {
        console.log('FAILED!');
        console.log(`   -> Status: ${res.status}`);
        console.log(`   -> Response:`, res.body);
        console.log(`   -> Boss count: ${bossMatches}\n`);
      }
    } catch (err) {
      console.log('ERROR!', err.message);
    }
  }

  console.log(`\n=== TEST RESULTS: ${passed}/${testCases.length} PASSED ===`);
}

runTests();
