const body = document.body;
const poemCard = document.querySelector("#poem-card");
const readingPanel = document.querySelector("#reading-panel");
const onboardingCard = document.querySelector("#onboarding-card");
const warningCard = document.querySelector("#warning-card");
const actionMenu = document.querySelector("#action-menu");
const openMenuButton = document.querySelector("#open-menu");
const toast = document.querySelector("#toast");
const themeToggle = document.querySelector("#theme-toggle");
const scenarioButtons = [...document.querySelectorAll("[data-scene]")];

const poems = [
  {
    lines: "好雨知时节，<br>当春乃发生。",
    source: "杜甫　《春夜喜雨》",
    reason: "谷雨时节草木正需雨水，今天的春雨恰好回应了诗中的生长。"
  },
  {
    lines: "沾衣欲湿杏花雨，<br>吹面不寒杨柳风。",
    source: "志南　《绝句》",
    reason: "暮春的小雨带着暖意，这两句写的正是今天这种轻柔湿润。"
  }
];

let currentPoem = 0;
let toastTimer;

function setScenario(activeScene) {
  scenarioButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.scene === activeScene);
  });

  poemCard.classList.add("is-hidden");
  readingPanel.classList.remove("is-open");
  readingPanel.setAttribute("aria-hidden", "true");
  onboardingCard.hidden = true;
  warningCard.hidden = true;
  hideActionMenu();

  if (activeScene === "card") {
    poemCard.classList.remove("is-hidden");
  }

  if (activeScene === "reading") {
    poemCard.classList.remove("is-hidden");
    readingPanel.classList.add("is-open");
    readingPanel.setAttribute("aria-hidden", "false");
  }

  if (activeScene === "onboarding") {
    onboardingCard.hidden = false;
  }

  if (activeScene === "warning") {
    warningCard.hidden = false;
  }
}

function openReading() {
  setScenario("reading");
}

function closeReading() {
  readingPanel.classList.remove("is-open");
  readingPanel.setAttribute("aria-hidden", "true");
  scenarioButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.scene === "card");
  });
}

function showCard() {
  setScenario("card");
}

function hideCard() {
  poemCard.classList.add("is-hidden");
  hideActionMenu();
}

function hideActionMenu() {
  actionMenu.hidden = true;
  openMenuButton.setAttribute("aria-expanded", "false");
}

function toggleActionMenu() {
  actionMenu.hidden = !actionMenu.hidden;
  openMenuButton.setAttribute("aria-expanded", String(!actionMenu.hidden));
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2200);
}

function toggleFavorite(button) {
  const isFavorite = button.dataset.favorite === "true";
  button.dataset.favorite = String(!isFavorite);

  const label = button.querySelector("span");
  if (label) {
    label.textContent = isFavorite ? "收藏" : "已收藏";
  } else {
    button.textContent = isFavorite ? "收藏这首" : "已收藏";
  }

  showToast(isFavorite ? "已取消收藏" : "已收藏到本地");
  hideActionMenu();
}

function replacePoem() {
  currentPoem = (currentPoem + 1) % poems.length;
  const poem = poems[currentPoem];
  document.querySelector("#poem-title").innerHTML = poem.lines;
  document.querySelector(".poem-source").textContent = poem.source;
  document.querySelector("#recommendation").textContent = poem.reason;
  hideActionMenu();
  showToast("今日诗笺已更换，本日不再提供替换");
}

scenarioButtons.forEach((button) => {
  button.addEventListener("click", () => setScenario(button.dataset.scene));
});

document.querySelector("#open-reading").addEventListener("click", openReading);
document.querySelector("#close-reading").addEventListener("click", closeReading);
document.querySelector("#close-card").addEventListener("click", hideCard);
document.querySelector("#tray-button").addEventListener("click", showCard);
document.querySelector("#open-menu").addEventListener("click", toggleActionMenu);
document.querySelector("#close-warning").addEventListener("click", () => {
  warningCard.hidden = true;
});

document.querySelector("#favorite-action").addEventListener("click", (event) => {
  toggleFavorite(event.currentTarget);
});

document.querySelector("#panel-favorite").addEventListener("click", (event) => {
  toggleFavorite(event.currentTarget);
});

document.querySelector("#replace-action").addEventListener("click", replacePoem);
document.querySelector("#dislike-action").addEventListener("click", () => {
  hideCard();
  hideActionMenu();
  showToast("已记录，后续会减少类似内容");
});

document.querySelector("#confirm-city").addEventListener("click", () => {
  const city = document.querySelector("#city-input").value.trim();
  if (!city) {
    showToast("请先填写城市");
    return;
  }
  showToast(`已将常用城市设为${city}`);
  window.setTimeout(showCard, 500);
});

document.querySelector(".warning-link").addEventListener("click", () => {
  showToast("正式产品将跳转到天气数据来源的官方页面");
});

themeToggle.addEventListener("click", () => {
  const isDark = body.classList.toggle("is-dark");
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.lastChild.textContent = isDark ? " 浅色" : " 深色";
});

document.addEventListener("click", (event) => {
  if (!actionMenu.hidden && !actionMenu.contains(event.target) && !openMenuButton.contains(event.target)) {
    hideActionMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  if (readingPanel.classList.contains("is-open")) {
    closeReading();
    return;
  }

  if (!actionMenu.hidden) {
    hideActionMenu();
    return;
  }

  hideCard();
});

setScenario("card");
