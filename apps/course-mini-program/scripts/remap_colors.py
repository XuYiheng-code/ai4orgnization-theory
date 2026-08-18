#!/usr/bin/env python3
"""受控重映射：把小程序 WXSS 中的 off-brand 色值替换为网站实际调色板。

映射原则（对应已上线网站 ai4orgnization-theory.cn / styles.css）：
  近黑 #171716（深块/深字）→ 学院蓝 #0a407a
  粉   #e95094（强调标签/进度/链接）→ 橙 #df7625
  黄   #f0ad2f（信号）→ 橙 #df7625
  米色 #f5f2eb（页面底）→ 白 #ffffff
  米白 #fffdf8（卡片面）→ 沙蓝 #f3f7fc
  边线 #ded9ce/#cfc9bd/#e7e2d8 → 蓝灰 #d9e2ec/#c3cee0/#e3e9f2
  次墨 #716e67/#625f59/#55504a → #5e6e7f/#5e6e7f/#46535f
  浅灰文字（深块上的）#8e8980 等 → 蓝灰浅色
  当前周高亮 #c8377a/#f9dcea → 橙系
  错误 #892f2b/#fbe7e4 → 危险红 #9f4a36
  链接 #3a6ea5 → 蓝 #1a65b6
仅处理 pages/ components/ custom-tab-bar/ 下的 .wxss，不动 app.wxss（其 token 已手动重写）。
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent / "miniprogram"

MAPPING = {
    "#171716": "#0a407a",   # 深块/深字 → 学院蓝
    "#e95094": "#df7625",   # 粉强调 → 橙
    "#f0ad2f": "#df7625",   # 黄信号 → 橙
    "#f5f2eb": "#ffffff",   # 米色底 → 白
    "#fffdf8": "#f3f7fc",   # 卡片面 → 沙蓝
    "#ded9ce": "#d9e2ec",   # 边线
    "#cfc9bd": "#c3cee0",   # 边线(强)
    "#e7e2d8": "#e3e9f2",   # 边线(浅)
    "#716e67": "#5e6e7f",   # 次墨
    "#625f59": "#5e6e7f",   # 次墨
    "#55504a": "#46535f",   # 次墨(强)
    "#8e8980": "#8493a3",   # 浅灰文字(深块上)
    "#aaa59c": "#9aa7b4",   # placeholder
    "#aaa69e": "#9aa7b4",   # placeholder
    "#c8c4bc": "#c9d6e6",   # 深块上浅文字
    "#c4c0b8": "#c9d6e6",   # 深块上浅文字
    "#d2cec6": "#d2dce8",   # 深块上浅文字
    "#ddd8ce": "#d2dce8",   # 深块上浅文字
    "#c8377a": "#df7625",   # 当前周高亮 → 橙
    "#f9dcea": "#fbe6d6",   # 当前周底 → 橙浅
    "#fbe7e4": "#f7e6e1",   # 错误底
    "#892f2b": "#9f4a36",   # 错误字 → 危险红
    "#fff8e8": "#fdf1e6",   # 反馈底
    "#ad7620": "#b5651d",   # 演示/反馈标签
    "#151515": "#142235",   # 隐私正文
    "#2a2620": "#33414f",   # 隐私次文
    "#3a6ea5": "#1a65b6",   # 链接 → 蓝
    "#3f3d39": "#33414f",   # 问答正文
    "#77736c": "#5e6e7f",   # tabbar/域 非激活
    "#d8d3c9": "#c3cee0",   # 禁用
    "#f1ede4": "#eef2f7",   # 取消按钮底
    "#45433f": "#072a52",   # 进度轨道(深块上) → 深蓝
    "#5a5752": "#3a4a5e",   # 深块上标签边
}

TARGET_DIRS = ["pages", "components", "custom-tab-bar"]


def main():
    changed_files = 0
    total_replacements = 0
    for sub in TARGET_DIRS:
        base = ROOT / sub
        if not base.exists():
            continue
        for path in sorted(base.rglob("*.wxss")):
            text = path.read_text(encoding="utf-8")
            new_text = text
            count = 0
            for old, new in MAPPING.items():
                n = new_text.count(old)
                if n:
                    new_text = new_text.replace(old, new)
                    count += n
            if count:
                path.write_text(new_text, encoding="utf-8")
                changed_files += 1
                total_replacements += count
                print(f"  {path.relative_to(ROOT)}  +{count}")
    print(f"完成：{changed_files} 个文件，{total_replacements} 处替换。")


if __name__ == "__main__":
    main()
