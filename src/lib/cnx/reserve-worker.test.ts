import { expect, it } from "vitest";
import worker from "../../../workers/reserve/src/index.js";

it("renders attacker-controlled diagnostics as text instead of executable HTML", async () => {
  const request = new Request("https://reserve.test/path?name=one&next=two", {
    headers: { "user-agent": '</pre><img src=x onerror="alert(1)">&\'"' },
  });
  const response = await worker.fetch(request, { PROVINCE: '</pre><script>alert("env")</script>' }, {});
  const html = await response.text();
  expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("<script");
  expect(html).toContain('&lt;/pre&gt;&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;&quot;');
  expect(html).toContain('&lt;/pre&gt;&lt;script&gt;alert(&quot;env&quot;)&lt;/script&gt;');
  expect(html).toContain("?name=one&amp;next=two");
  expect(html.match(/<pre>/g)).toHaveLength(1);
  expect(html.match(/<\/pre>/g)).toHaveLength(1);
});
