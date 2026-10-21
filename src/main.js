import "./style.css";
import { Game } from "./game.js";
const canvas = document.getElementById("game-canvas");
const root = document.getElementById("app");
try {
  const game = new Game(canvas, root);
  window.__game = game;
  game.init().catch((error) => {
    console.error(error);
    root.innerHTML =
      '<div style="position:fixed;inset:0;background:#182b29;color:#f4e7ca;display:grid;place-items:center;padding:40px;font:18px system-ui">世界を開けませんでした。ページを再読み込みしてください。<br>' +
      String(error.message).replace(/[<>&]/g, "") +
      "</div>";
  });
} catch (error) {
  console.error(error);
  root.innerHTML =
    '<div style="position:fixed;inset:0;background:#182b29;color:#f4e7ca;display:grid;place-items:center;padding:40px;font:18px system-ui">WILDBOUND の起動には WebGL 2 対応ブラウザが必要です。<br>Chrome / Edge / Firefox の最新版で、ハードウェアアクセラレーションを有効にしてください。</div>';
}
