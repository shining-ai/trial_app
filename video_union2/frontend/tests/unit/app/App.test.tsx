import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { App } from "../../../src/app/App";

afterEach(cleanup);

test("画面の見出しにアプリ名「動画結合アプリ」が表示される", () => {
  render(<App />);

  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("動画結合アプリ");
});
