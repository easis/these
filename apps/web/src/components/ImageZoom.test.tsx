import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageZoom } from "./ImageZoom";

describe("ImageZoom pointer interactions", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does not start panning from the zoom controls when the image is pannable", () => {
    const { capture, zoomIn } = renderPannableImage();

    fireEvent(zoomIn, pointerEvent("pointerdown", { pointerId: 7, clientX: 320, clientY: 200 }));

    expect(capture).not.toHaveBeenCalled();
  });

  it("still captures a pointer that starts panning on the image", () => {
    const { capture, image } = renderPannableImage();

    fireEvent(image, pointerEvent("pointerdown", { pointerId: 8, clientX: 320, clientY: 200 }));

    expect(capture).toHaveBeenCalledWith(8);
  });

  it("keeps every available control working after reaching maximum zoom", () => {
    renderPannableImage();
    const zoomIn = screen.getByRole("button", { name: "Zoom in" }) as HTMLButtonElement;
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });
    const actual = screen.getByRole("button", { name: "Show at actual size" });

    zoomToMaximum(zoomIn);
    expect(zoomIn).toBeDisabled();
    expect(screen.getByRole("button", { name: "Fit image, current zoom 400%" })).toBeInTheDocument();

    fireEvent.click(zoomOut);
    expect(screen.getByRole("button", { name: "Fit image, current zoom 300%" })).toBeInTheDocument();
    fireEvent.click(zoomIn);
    fireEvent.click(actual);
    expect(screen.getByRole("button", { name: "Fit image, current zoom 100%" })).toBeInTheDocument();

    zoomToMaximum(zoomIn);
    fireEvent.click(screen.getByRole("button", { name: "Fit image, current zoom 400%" }));
    expect(screen.getByRole("button", { name: "Fit image, current zoom 50%" })).toHaveTextContent("Fit");
  });

  it("zooms around the pointer with the mouse wheel", () => {
    const { image, viewport } = renderPannableImage();
    const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 450, clientY: 200, deltaY: -100 });

    fireEvent(viewport, wheel);

    expect(wheel.defaultPrevented).toBe(true);
    expect(screen.getByRole("button", { name: "Fit image, current zoom 100%" })).toBeInTheDocument();
    expect(image).toHaveStyle({ transform: "translate3d(calc(-50% + -50px), calc(-50% + 0px), 0)" });
  });

  it("returns to a centered fit with the middle mouse button", () => {
    const { image, viewport } = renderPannableImage();
    fireEvent(viewport, new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 450, clientY: 200, deltaY: -100 }));

    const middleClick = pointerEvent("pointerdown", { button: 1, pointerId: 9, clientX: 450, clientY: 200 });
    fireEvent(viewport, middleClick);

    expect(middleClick.defaultPrevented).toBe(true);
    expect(screen.getByRole("button", { name: "Fit image, current zoom 50%" })).toHaveTextContent("Fit");
    expect(image).toHaveStyle({ transform: "translate3d(calc(-50% + 0px), calc(-50% + 0px), 0)" });
  });

  it("does not turn zoom out into zoom in when fit is below the custom minimum", () => {
    const { viewport } = renderImage(3000, 2000);
    const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 300, clientY: 200, deltaY: 100 });

    fireEvent(viewport, wheel);

    expect(wheel.defaultPrevented).toBe(true);
    expect(screen.getByRole("button", { name: "Fit image, current zoom 20%" })).toHaveTextContent("Fit");
  });
});

function renderPannableImage() {
  const rendered = renderImage(1200, 800);
  const zoomIn = screen.getByRole("button", { name: "Zoom in" });
  fireEvent.click(zoomIn);
  return { ...rendered, zoomIn };
}

function renderImage(naturalWidth: number, naturalHeight: number) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
  render(<ImageZoom path="/media/example.jpg" name="example.jpg" src="/api/media/example.jpg" layoutKey={false} />);

  const controls = screen.getByRole("group", { name: "Image zoom controls" });
  const viewport = controls.parentElement as HTMLDivElement;
  const image = screen.getByRole("img", { name: "example.jpg" });
  const capture = vi.fn();
  Object.defineProperties(viewport, {
    getBoundingClientRect: { configurable: true, value: () => ({ bottom: 400, height: 400, left: 0, right: 600, top: 0, width: 600, x: 0, y: 0, toJSON: () => ({}) }) },
    setPointerCapture: { configurable: true, value: capture },
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: vi.fn() },
  });
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: naturalWidth },
    naturalHeight: { configurable: true, value: naturalHeight },
  });
  fireEvent.load(image);

  return { capture, image, viewport };
}

function zoomToMaximum(zoomIn: HTMLButtonElement) {
  for (let step = 0; step < 10 && !zoomIn.disabled; step += 1) fireEvent.click(zoomIn);
}

function pointerEvent(type: string, values: { button?: number; pointerId: number; clientX: number; clientY: number }) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: values.button ?? 0 },
    pointerId: { value: values.pointerId },
    clientX: { value: values.clientX },
    clientY: { value: values.clientY },
  });
  return event;
}
