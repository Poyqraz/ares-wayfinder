// Whether a WebGL context runs on real graphics hardware. On a software renderer the app stays in Scientific View by
// default: the cinematic sky, haze and ground shader cost too much there. The user can still switch.
export function isHardwareWebgl(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  try {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return !/swiftshader|llvmpipe|software|basic render/i.test(renderer);
  } catch {
    return false;
  }
}
