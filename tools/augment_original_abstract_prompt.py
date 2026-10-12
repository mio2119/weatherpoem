from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from lxml import etree


SOURCE = Path(
    r"D:\BaiduNetdiskDownload\2026国赛各类AI实用工具和提示词汇总！"
    r"\国奖级AI升级+精美图表AI升级提示词！"
    r"\2026国赛国奖级论文AI自动优化升级提示词.docx"
)
OUTPUT = Path(r"E:\weatherpoem\2026国赛国奖级论文AI自动优化升级提示词_摘要方法合理性补充版.docx")

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W_NS}


def w_tag(local_name: str) -> str:
    return f"{{{W_NS}}}{local_name}"


def paragraph_text(paragraph: etree._Element) -> str:
    return "".join(paragraph.xpath(".//w:t/text()", namespaces=NS))


def paragraph_like(source: etree._Element, text: str) -> etree._Element:
    """Create a paragraph that reuses the source paragraph/run formatting."""
    paragraph = etree.Element(w_tag("p"), nsmap=source.nsmap)
    p_pr = source.find("w:pPr", namespaces=NS)
    if p_pr is not None:
        paragraph.append(deepcopy(p_pr))

    run = etree.SubElement(paragraph, w_tag("r"))
    source_run = source.find(".//w:r", namespaces=NS)
    if source_run is not None:
        r_pr = source_run.find("w:rPr", namespaces=NS)
        if r_pr is not None:
            run.append(deepcopy(r_pr))
    text_node = etree.SubElement(run, w_tag("t"))
    text_node.text = text
    return paragraph


def find_one(root: etree._Element, contains: str) -> etree._Element:
    matches = [p for p in root.xpath(".//w:p", namespaces=NS) if contains in paragraph_text(p)]
    if len(matches) != 1:
        raise RuntimeError(f"Expected one paragraph containing {contains!r}, found {len(matches)}")
    return matches[0]


def insert_after(anchor: etree._Element, texts: list[str]) -> None:
    parent = anchor.getparent()
    if parent is None:
        raise RuntimeError("Anchor paragraph has no parent")
    position = parent.index(anchor) + 1
    for offset, text in enumerate(texts):
        parent.insert(position + offset, paragraph_like(anchor, text))


def main() -> None:
    with ZipFile(SOURCE, "r") as source_zip:
        document_xml = source_zip.read("word/document.xml")
        root = etree.fromstring(document_xml)

        abstract_anchor = find_one(root, "禁止只说方法不说结果")
        insert_after(
            abstract_anchor,
            [
                "● 方法合理性要求：摘要中每个小问在说明所用模型或方法时，须用一句简明语句交代选择依据，说明其与题目目标、数据结构和约束条件的匹配关系；不得只罗列模型名称。",
                "● 数据处理说明要求：若数据经过缺失值、异常值、重复值处理，或标准化、归一化、样本划分、特征构造等步骤，摘要只说明对结果有实质影响的关键处理、处理对象和理由；无关键处理时不强行添加。",
                "● 一致性要求：摘要中的模型选择依据和数据处理说明必须与正文、代码、数据和真实运行结果一致；不得凭空补写，也不得为显得高级而强行加入复杂模型或无关处理。",
            ],
        )

        checklist_anchor = find_one(root, "摘要≤1000字符且在1页以内")
        insert_after(
            checklist_anchor,
            [
                "● [ ] 摘要逐小问交代模型或方法选择依据，并说明影响结论的关键数据处理、处理对象和理由；相关表述与正文、代码、数据及真实运行结果一致。"
            ],
        )

        updated_xml = etree.tostring(
            root,
            xml_declaration=True,
            encoding="UTF-8",
            standalone=True,
        )

        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        temporary = OUTPUT.with_suffix(".tmp.docx")
        with ZipFile(temporary, "w", compression=ZIP_DEFLATED) as output_zip:
            for info in source_zip.infolist():
                payload = updated_xml if info.filename == "word/document.xml" else source_zip.read(info.filename)
                output_zip.writestr(info, payload)
        temporary.replace(OUTPUT)

    print(OUTPUT)


if __name__ == "__main__":
    main()
