// ---------
// Constants
// ---------

// Global canvas context
var CTX = undefined;

// Length of each trail
var TRAIL_LENGTH = 15;

// Minimum zoom-in when everything is in one place
var MIN_SCALE = 24;

// Speed at which to change scales (percentage of scale difference per second)
var ZOOM_SPEED = 0.6

// --------------------
// Onload Functionality
// --------------------

// Run when the document is loaded:
document.onload = function () {
  let canvas = document.getElementById("labyrinth");
  CTX = canvas.getContext("2d");

  // Set initial canvas size & scale:
  update_canvas_size(canvas, CTX);
  set_scale(CTX, 1);
  set_destination(CTX, [0, 0]);
  CTX.trails = [
    { "seed": 19283801, "positions": [] },
    { "seed": 74982018, "positions": [] },
    { "seed": 57319834, "positions": [] },
  ];
  for (let tr of CTX.trails) {
    for (let i = 0; i < TRAIL_LENGTH; ++i) {
      tr.positions.push([0, 0]);
    }
  }

  // Listen for window resizes but wait until 20 ms after the last consecutive
  // one to do anything.
  var timer_id = undefined;
  window.addEventListener("resize", function() {
    if (timer_id != undefined) {
      clearTimeout(timer_id);
      timer_id = undefined;
    }
    timer_id = setTimeout(
      function () {
        timer_id = undefined;
        update_canvas_size();
      },
      20 // milliseconds
    );
  });

  // Scrolling updates scale:
  document.onwheel = function(ev) {
    if (ev.preventDefault) { ev.preventDefault(); }
    handle_scroll(CTX, ev);
  }

  // Clicking sets destination:
  document.onmouseup = function (ev) {
    if (ev.preventDefault) { ev.preventDefault(); }
    handle_tap(CTX, ev);
  }
  document.ontouchend = document.onmouseup;
  // TODO: Really this?
  document.ontouchcancel = document.onmouseup;

  // Draw every frame
  window.requestAnimationFrame(draw_frame);
};

// -------------------------
// Updaters & Event Handlers
// -------------------------

function set_scale(context, scale_factor) {
  // Scale is in world-units-per-canvas-width
  context.scale = scale_factor;
}

function set_destination(context, grid_coords) {
  // Sets the current destination.
  context.destination = grid_coords;
}

function update_canvas_size(canvas, context) {
  // Updates the canvas size. Called on resize after a timeout.
  var bounds = canvas.getBoundingClientRect();
  var car = bounds.width / bounds.height;
  canvas.width = 800 * car;
  canvas.height = 800;
  context.cwidth = canvas.width;
  context.cheight = canvas.height;
  context.middle = [context.cwidth / 2, context.cheight / 2];
  context.bounds = bounds;
}

// Scrolling constants
var PIXELS_PER_LINE = 18;
var LINES_PER_PAGE = 40;

function handle_scroll(ctx, ev) {
  let unit = ev.deltaMode;
  let dy = ev.deltaY;

  // Normalize units to pixels:
  if (unit == 1) {
    dy *= PIXELS_PER_LINE;
  } else if (unit == 2) {
    dy *= PIXELS_PER_LINE * LINES_PER_PAGE;
  }

  set_scale(ctx, ctx.scale * Math.min(0.1, (100 + dy) / 100));
}

function event_pos(ctx, ev) {
  // Returns viewport position of event.
  if (ev.touches) {
    ev = ev.touches[0];
  }
  rturn pc__vc([ev.clientX, ev.clientY]);
}

function handle_tap(ctx, ev) {
  let vc = event_pos(ctx, ev);
  let gc = wc__gc(cc__wc(vc__cc(vc)));
  set_destination(ctx, gc);
}

// --------------------
// Conversion functions
// --------------------

// Page <-> viewport coordinates
function pc__vc(ctx, pc) {
  return [
    (pc[0] - ctx.bounds.left) / ctx.bounds.width,
    (pc[1] - ctx.bounds.top) / ctx.bounds.height
  ];
}

function vc__pc(ctx, vc) {
  return [
    ctx.bounds.left + ctx.bounds.width * vc[0],
    ctx.bounds.top + ctx.bounds.height * vc[1],
  ];
}

// Viewport <-> canvas coordinates
function vc__cc(ctx, vc) {
  return [
    vc[0] * ctx.cwidth,
    vc[1] * ctx.cheight
  ];
}

function cc__vc(ctx, cc) {
  return [
    cc[0] / ctx.cwidth,
    cc[1] / ctx.cheight
  ];
}

// Canvas <-> world coordinates
function cc__wc(ctx, cc) {
  return [
    (cc[0]/ctx.cwidth) * ctx.scale,
    (cc[1]/ctx.cwidth) * ctx.scale // scale ignores canvas height
  ];
}

function wc__cc(ctx, wc) {
  return [
    (wc[0] / ctx.scale) * ctx.cwidth,
    (wc[1] / ctx.scale) * ctx.cwidth
  ];
}

// World <-> grid coordinates
function wc__gc(ctx, wc) {
  return [
    Math.floor(wc[0]),
    Math.floor(wc[1])
  ];
}

function gc__wc(ctx, gc) {
  return [
    gc[0] + 0.5,
    gc[1] + 0.5
  ];
}

// ------------
// Drawing Code
// ------------

function draw_frame(now) {
  // Draws a single frame & loops itself
  window.requestAnimationFrame(draw_frame);

  // Measure time
  let ms_time = window.performance.now();
  if (CTX.previous_frame_time == undefined) {
    CTX.previous_frame_time = ms_time;
    return; // skip this frame to get timing for the next one
  }
  let elapsed = ms_time - CTX.previous_frame_time;
  CTX.previous_frame_time = ms_time;

  adjust_scale(CTX, elapsed);
  draw_labyrinth(CTX, elapsed);
}

function interest_bb(ctx) {
  result = {
    "left": ctx.destination[0],
    "right": ctx.destination[0],
    "top": ctx.destination[1],
    "bottom": ctx.destination[1]
  }
  for (let trail of ctx.trails) {
    for (let pos of trail.positions) {
      if (pos[0] < result.left) { result.left = pos[0]; }
      if (pos[0] > result.right) { result.right = pos[0]; }
      if (pos[1] < result.top) { result.top = pos[1]; }
      if (pos[1] > result.bottom) { result.bottom = pos[1]; }
    }
  }
}

function adjust_scale(ctx, elapsed) {
  // Adjusts the scaling factor according to points of interest
  let ibb = interst_bb(ctx);

  let ideal_scale = Math.max(
    MIN_SCALE,
    ibb.right - ibb.left,
    (ibb.bottom - ibb.top) * (ctx.cwidth / ctx.cheight)
  );

  let scale_diff = ideal_scale - ctx.scale;

  ctx.scale = Math.max(
    MIN_SCALE,
    ctx.scale + ZOOM_SPEED * scale_diff * (elapsed / 1000)
  );
}

function draw_labyrinth(ctx, elapsed) {
  // Draws the visible portion of the labyrinth
  // TODO: HERE
}

// --------------
// Labyrinth Code
// --------------
