// UserPromptSubmit hook: when a prompt is about OpenFunnels, landing pages or
// funnels, remind Claude to load the funnel-packager skill before building.
// Skills are chosen by Claude from a listing that can drop descriptions when
// many skills are installed, so this makes the trigger deterministic.
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  let prompt = '';
  try { prompt = JSON.parse(input).prompt || ''; } catch { return; }
  if (!/open\s?funnels?|landing[\s-]?pages?|\bfunnels?\b|index-b\.html|funnel\.json|tracking\.md/i.test(prompt)) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: 'This request involves OpenFunnels landing pages or funnels. If you have not already loaded it in this conversation, invoke the openfunnels:funnel-packager skill before building, editing or packaging any page, and follow its rules.'
    }
  }));
});
