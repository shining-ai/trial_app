import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { VideoThumbnail } from "../../../../src/features/merge/VideoThumbnail";

afterEach(cleanup);

test("動画のIDのサムネイルのURLを画像として表示する", () => {
  render(<VideoThumbnail videoId="0123456789abcdef0123456789abcdef" />);

  const image = screen.getByTestId("video-thumbnail");
  expect(image.tagName).toBe("IMG");
  expect(image.getAttribute("src")).toBe("/api/videos/0123456789abcdef0123456789abcdef/thumbnail");
  // ファイル名がすぐ隣にあるので、画像は装飾として読み上げない
  expect(image.getAttribute("alt")).toBe("");
  expect(screen.queryByText("画像なし")).toBeNull();
});

test("画像の読み込みに失敗すると、画像の代わりに「画像なし」の枠を表示する", () => {
  render(<VideoThumbnail videoId="0123456789abcdef0123456789abcdef" />);

  fireEvent.error(screen.getByTestId("video-thumbnail"));

  expect(document.querySelector("img")).toBeNull();
  expect(screen.queryByTestId("video-thumbnail")).toBeNull();
  expect(screen.getByText("画像なし")).toBeTruthy();
});

test("別の動画に変わると、失敗の表示を戻して新しい画像を読み込む", () => {
  const { rerender } = render(<VideoThumbnail videoId="0123456789abcdef0123456789abcdef" />);
  fireEvent.error(screen.getByTestId("video-thumbnail"));

  rerender(<VideoThumbnail videoId="fedcba9876543210fedcba9876543210" />);

  expect(screen.getByTestId("video-thumbnail").getAttribute("src")).toBe(
    "/api/videos/fedcba9876543210fedcba9876543210/thumbnail",
  );
  expect(screen.queryByText("画像なし")).toBeNull();
});
