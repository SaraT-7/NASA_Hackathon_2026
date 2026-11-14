"""Boxwork Seferi - Mars yürüyüş planlama arayüzü (Streamlit).

Çalıştırma:  streamlit run app.py
"""
import streamlit as st

st.set_page_config(page_title="Boxwork Seferi - Mars Haritası", layout="wide")

mode = st.sidebar.radio("Mod", ["Planlama", "Yürüyüş"])

st.title("Mars Keşif Yürüyüşü İçin Akıllı Harita")
st.caption("Gale Krateri · Mount Sharp · Boxwork oluşumları")

if mode == "Planlama":
    st.info("Planlama ekranı: katmanlar, bilim noktaları, alternatif rotalar (yapılacak).")
else:
    st.info("Yürüyüş görünümü: sıradaki durak, kalan mesafe, dönüş payı (yapılacak).")
