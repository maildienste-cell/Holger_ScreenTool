const { mouse, Point, straightTo } = require('@nut-tree-fork/nut-js');
(async () => {
  try {
    console.log("Moving mouse to 200, 200...");
    await mouse.move(straightTo(new Point(200, 200)));
    console.log("Done");
  } catch (e) {
    console.error("Error:", e);
  }
})();
