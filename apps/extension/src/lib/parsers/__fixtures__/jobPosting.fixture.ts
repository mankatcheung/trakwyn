/** A posting page: site chrome around the posting in `<main>`. */
export const POSTING_WITH_MAIN = `
  <header><nav>Home Jobs Messaging</nav></header>
  <main>
    <h1>Senior Platform Engineer</h1>
    <p>Acme Corp · Remote (EU)</p>
    <p>${'We are building the infrastructure that keeps our customers online. '.repeat(6)}</p>
  </main>
  <footer>Privacy Terms Cookies</footer>`;

/** No landmark wrapper at all: only the body carries the posting. */
export const POSTING_WITHOUT_MAIN = `
  <div>
    <h1>Data Analyst</h1>
    <p>Globex</p>
  </div>
  <div><p>Own the reporting that finance and product rely on.</p></div>`;

/** A `<main>` holding a consent stub, with the posting outside it. */
export const POSTING_WITH_STUB_MAIN = `
  <main>Accept cookies</main>
  <section><h1>Designer</h1><p>Initech needs a designer.</p></section>`;
