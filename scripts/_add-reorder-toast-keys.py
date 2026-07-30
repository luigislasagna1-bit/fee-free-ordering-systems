# -*- coding: utf-8 -*-
"""Add the 5 reorder-banner keys (ordering.toasts.reorder*) to all 37 non-English
locales — the reorder banner was hardcoded English (standing i18n rule) and the
sold-out reorder gap fix added one new sentence. en.json already edited by hand.
Plural categories follow CLDR per locale. Idempotent: skips keys already present.
"""
import json

TRANSLATIONS = {
    "fr": {
        "reorderAdded": "{count, plural, one {# article de votre commande précédente a été ajouté.} other {# articles de votre commande précédente ont été ajoutés.}}",
        "reorderDroppedGone": "{count, plural, one {# article n'a pas pu être rajouté — il n'est plus au menu.} other {# articles n'ont pas pu être rajoutés — ils ne sont plus au menu.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# article n'a pas pu être rajouté — il est en rupture pour le moment.} other {# articles n'ont pas pu être rajoutés — ils sont en rupture pour le moment.}}",
        "reorderReviewMods": "Veuillez vérifier les options avant de valider votre commande.",
        "reorderFailed": "Désolé — nous n'avons pas pu restaurer cette commande. Essayez d'ajouter les articles manuellement.",
    },
    "es": {
        "reorderAdded": "{count, plural, one {Se añadió # artículo de tu pedido anterior.} other {Se añadieron # artículos de tu pedido anterior.}}",
        "reorderDroppedGone": "{count, plural, one {# artículo no se pudo volver a añadir — ya no está en el menú.} other {# artículos no se pudieron volver a añadir — ya no están en el menú.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# artículo no se pudo volver a añadir — ahora mismo está agotado.} other {# artículos no se pudieron volver a añadir — ahora mismo están agotados.}}",
        "reorderReviewMods": "Revisa las opciones antes de finalizar tu pedido.",
        "reorderFailed": "Lo sentimos — no pudimos recuperar ese pedido. Prueba a añadir los artículos manualmente.",
    },
    "it": {
        "reorderAdded": "{count, plural, one {Aggiunto # articolo dal tuo ordine precedente.} other {Aggiunti # articoli dal tuo ordine precedente.}}",
        "reorderDroppedGone": "{count, plural, one {# articolo non è stato riaggiunto — non è più nel menu.} other {# articoli non sono stati riaggiunti — non sono più nel menu.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# articolo non è stato riaggiunto — al momento è esaurito.} other {# articoli non sono stati riaggiunti — al momento sono esauriti.}}",
        "reorderReviewMods": "Controlla le opzioni prima di completare l'ordine.",
        "reorderFailed": "Spiacenti — non siamo riusciti a ripristinare quell'ordine. Prova ad aggiungere gli articoli manualmente.",
    },
    "de": {
        "reorderAdded": "{count, plural, one {# Artikel aus deiner letzten Bestellung hinzugefügt.} other {# Artikel aus deiner letzten Bestellung hinzugefügt.}}",
        "reorderDroppedGone": "{count, plural, one {# Artikel konnte nicht erneut hinzugefügt werden — er steht nicht mehr auf der Speisekarte.} other {# Artikel konnten nicht erneut hinzugefügt werden — sie stehen nicht mehr auf der Speisekarte.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# Artikel konnte nicht erneut hinzugefügt werden — er ist gerade ausverkauft.} other {# Artikel konnten nicht erneut hinzugefügt werden — sie sind gerade ausverkauft.}}",
        "reorderReviewMods": "Bitte überprüfe die Optionen, bevor du zur Kasse gehst.",
        "reorderFailed": "Entschuldigung — wir konnten diese Bestellung nicht wiederherstellen. Füge die Artikel bitte manuell hinzu.",
    },
    "pt": {
        "reorderAdded": "{count, plural, one {# item do seu pedido anterior foi adicionado.} other {# itens do seu pedido anterior foram adicionados.}}",
        "reorderDroppedGone": "{count, plural, one {# item não pôde ser adicionado novamente — já não está no menu.} other {# itens não puderam ser adicionados novamente — já não estão no menu.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# item não pôde ser adicionado novamente — está esgotado neste momento.} other {# itens não puderam ser adicionados novamente — estão esgotados neste momento.}}",
        "reorderReviewMods": "Reveja as opções antes de finalizar o pedido.",
        "reorderFailed": "Lamentamos — não conseguimos recuperar esse pedido. Tente adicionar os itens manualmente.",
    },
    "pt-BR": {
        "reorderAdded": "{count, plural, one {Adicionamos # item do seu pedido anterior.} other {Adicionamos # itens do seu pedido anterior.}}",
        "reorderDroppedGone": "{count, plural, one {# item não pôde ser adicionado de novo — não está mais no cardápio.} other {# itens não puderam ser adicionados de novo — não estão mais no cardápio.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# item não pôde ser adicionado de novo — está esgotado no momento.} other {# itens não puderam ser adicionados de novo — estão esgotados no momento.}}",
        "reorderReviewMods": "Confira as opções antes de fechar o pedido.",
        "reorderFailed": "Desculpe — não conseguimos recuperar esse pedido. Tente adicionar os itens manualmente.",
    },
    "nl": {
        "reorderAdded": "{count, plural, one {# item uit je vorige bestelling toegevoegd.} other {# items uit je vorige bestelling toegevoegd.}}",
        "reorderDroppedGone": "{count, plural, one {# item kon niet opnieuw worden toegevoegd — het staat niet meer op het menu.} other {# items konden niet opnieuw worden toegevoegd — ze staan niet meer op het menu.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# item kon niet opnieuw worden toegevoegd — het is momenteel uitverkocht.} other {# items konden niet opnieuw worden toegevoegd — ze zijn momenteel uitverkocht.}}",
        "reorderReviewMods": "Controleer de opties voordat je afrekent.",
        "reorderFailed": "Sorry — we konden die bestelling niet herstellen. Probeer de items handmatig toe te voegen.",
    },
    "ro": {
        "reorderAdded": "{count, plural, one {Am adăugat # produs din comanda ta anterioară.} few {Am adăugat # produse din comanda ta anterioară.} other {Am adăugat # de produse din comanda ta anterioară.}}",
        "reorderDroppedGone": "{count, plural, one {# produs nu a putut fi readăugat — nu mai este în meniu.} few {# produse nu au putut fi readăugate — nu mai sunt în meniu.} other {# de produse nu au putut fi readăugate — nu mai sunt în meniu.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# produs nu a putut fi readăugat — momentan este epuizat.} few {# produse nu au putut fi readăugate — momentan sunt epuizate.} other {# de produse nu au putut fi readăugate — momentan sunt epuizate.}}",
        "reorderReviewMods": "Verifică opțiunile înainte de a finaliza comanda.",
        "reorderFailed": "Ne pare rău — nu am putut recupera acea comandă. Încearcă să adaugi produsele manual.",
    },
    "sv": {
        "reorderAdded": "{count, plural, one {La till # artikel från din förra beställning.} other {La till # artiklar från din förra beställning.}}",
        "reorderDroppedGone": "{count, plural, one {# artikel kunde inte läggas till igen — den finns inte längre på menyn.} other {# artiklar kunde inte läggas till igen — de finns inte längre på menyn.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# artikel kunde inte läggas till igen — den är slutsåld just nu.} other {# artiklar kunde inte läggas till igen — de är slutsålda just nu.}}",
        "reorderReviewMods": "Kontrollera tillvalen innan du går till kassan.",
        "reorderFailed": "Tyvärr — vi kunde inte återställa den beställningen. Prova att lägga till artiklarna manuellt.",
    },
    "da": {
        "reorderAdded": "{count, plural, one {Tilføjede # vare fra din tidligere bestilling.} other {Tilføjede # varer fra din tidligere bestilling.}}",
        "reorderDroppedGone": "{count, plural, one {# vare kunne ikke tilføjes igen — den er ikke længere på menuen.} other {# varer kunne ikke tilføjes igen — de er ikke længere på menuen.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# vare kunne ikke tilføjes igen — den er udsolgt lige nu.} other {# varer kunne ikke tilføjes igen — de er udsolgt lige nu.}}",
        "reorderReviewMods": "Tjek tilvalgene, før du gennemfører bestillingen.",
        "reorderFailed": "Beklager — vi kunne ikke gendanne den bestilling. Prøv at tilføje varerne manuelt.",
    },
    "nb": {
        "reorderAdded": "{count, plural, one {La til # vare fra din forrige bestilling.} other {La til # varer fra din forrige bestilling.}}",
        "reorderDroppedGone": "{count, plural, one {# vare kunne ikke legges til på nytt — den er ikke lenger på menyen.} other {# varer kunne ikke legges til på nytt — de er ikke lenger på menyen.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# vare kunne ikke legges til på nytt — den er utsolgt akkurat nå.} other {# varer kunne ikke legges til på nytt — de er utsolgt akkurat nå.}}",
        "reorderReviewMods": "Se over tilvalgene før du fullfører bestillingen.",
        "reorderFailed": "Beklager — vi kunne ikke gjenopprette den bestillingen. Prøv å legge til varene manuelt.",
    },
    "fi": {
        "reorderAdded": "{count, plural, one {Lisättiin # tuote edellisestä tilauksestasi.} other {Lisättiin # tuotetta edellisestä tilauksestasi.}}",
        "reorderDroppedGone": "{count, plural, one {# tuotetta ei voitu lisätä uudelleen — se ei ole enää ruokalistalla.} other {# tuotetta ei voitu lisätä uudelleen — ne eivät ole enää ruokalistalla.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# tuotetta ei voitu lisätä uudelleen — se on tällä hetkellä loppuunmyyty.} other {# tuotetta ei voitu lisätä uudelleen — ne ovat tällä hetkellä loppuunmyytyjä.}}",
        "reorderReviewMods": "Tarkista valinnat ennen tilauksen tekemistä.",
        "reorderFailed": "Pahoittelut — emme voineet palauttaa tilausta. Kokeile lisätä tuotteet käsin.",
    },
    "pl": {
        "reorderAdded": "{count, plural, one {Dodano # pozycję z Twojego poprzedniego zamówienia.} few {Dodano # pozycje z Twojego poprzedniego zamówienia.} many {Dodano # pozycji z Twojego poprzedniego zamówienia.} other {Dodano # pozycji z Twojego poprzedniego zamówienia.}}",
        "reorderDroppedGone": "{count, plural, one {# pozycji nie udało się dodać ponownie — nie ma jej już w menu.} few {# pozycji nie udało się dodać ponownie — nie ma ich już w menu.} many {# pozycji nie udało się dodać ponownie — nie ma ich już w menu.} other {# pozycji nie udało się dodać ponownie — nie ma ich już w menu.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# pozycji nie udało się dodać ponownie — jest obecnie wyprzedana.} few {# pozycji nie udało się dodać ponownie — są obecnie wyprzedane.} many {# pozycji nie udało się dodać ponownie — są obecnie wyprzedane.} other {# pozycji nie udało się dodać ponownie — są obecnie wyprzedane.}}",
        "reorderReviewMods": "Sprawdź opcje przed złożeniem zamówienia.",
        "reorderFailed": "Przepraszamy — nie udało się przywrócić tego zamówienia. Spróbuj dodać pozycje ręcznie.",
    },
    "cs": {
        "reorderAdded": "{count, plural, one {Přidali jsme # položku z vaší předchozí objednávky.} few {Přidali jsme # položky z vaší předchozí objednávky.} other {Přidali jsme # položek z vaší předchozí objednávky.}}",
        "reorderDroppedGone": "{count, plural, one {# položku se nepodařilo znovu přidat — už není v nabídce.} few {# položky se nepodařilo znovu přidat — už nejsou v nabídce.} other {# položek se nepodařilo znovu přidat — už nejsou v nabídce.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# položku se nepodařilo znovu přidat — je momentálně vyprodaná.} few {# položky se nepodařilo znovu přidat — jsou momentálně vyprodané.} other {# položek se nepodařilo znovu přidat — jsou momentálně vyprodané.}}",
        "reorderReviewMods": "Před dokončením objednávky zkontrolujte možnosti.",
        "reorderFailed": "Omlouváme se — objednávku se nepodařilo obnovit. Zkuste položky přidat ručně.",
    },
    "sk": {
        "reorderAdded": "{count, plural, one {Pridali sme # položku z vašej predchádzajúcej objednávky.} few {Pridali sme # položky z vašej predchádzajúcej objednávky.} other {Pridali sme # položiek z vašej predchádzajúcej objednávky.}}",
        "reorderDroppedGone": "{count, plural, one {# položku sa nepodarilo znova pridať — už nie je v ponuke.} few {# položky sa nepodarilo znova pridať — už nie sú v ponuke.} other {# položiek sa nepodarilo znova pridať — už nie sú v ponuke.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# položku sa nepodarilo znova pridať — momentálne je vypredaná.} few {# položky sa nepodarilo znova pridať — momentálne sú vypredané.} other {# položiek sa nepodarilo znova pridať — momentálne sú vypredané.}}",
        "reorderReviewMods": "Pred dokončením objednávky skontrolujte možnosti.",
        "reorderFailed": "Ospravedlňujeme sa — objednávku sa nepodarilo obnoviť. Skúste položky pridať ručne.",
    },
    "hu": {
        "reorderAdded": "{count, plural, one {# tétel hozzáadva az előző rendelésedből.} other {# tétel hozzáadva az előző rendelésedből.}}",
        "reorderDroppedGone": "{count, plural, one {# tételt nem lehetett újra hozzáadni — már nincs az étlapon.} other {# tételt nem lehetett újra hozzáadni — már nincs az étlapon.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# tételt nem lehetett újra hozzáadni — jelenleg elfogyott.} other {# tételt nem lehetett újra hozzáadni — jelenleg elfogyott.}}",
        "reorderReviewMods": "Kérjük, ellenőrizd az opciókat a rendelés leadása előtt.",
        "reorderFailed": "Sajnáljuk — nem sikerült visszaállítani azt a rendelést. Próbáld meg kézzel hozzáadni a tételeket.",
    },
    "el": {
        "reorderAdded": "{count, plural, one {Προστέθηκε # προϊόν από την προηγούμενη παραγγελία σας.} other {Προστέθηκαν # προϊόντα από την προηγούμενη παραγγελία σας.}}",
        "reorderDroppedGone": "{count, plural, one {# προϊόν δεν μπόρεσε να προστεθεί ξανά — δεν υπάρχει πια στο μενού.} other {# προϊόντα δεν μπόρεσαν να προστεθούν ξανά — δεν υπάρχουν πια στο μενού.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# προϊόν δεν μπόρεσε να προστεθεί ξανά — αυτή τη στιγμή έχει εξαντληθεί.} other {# προϊόντα δεν μπόρεσαν να προστεθούν ξανά — αυτή τη στιγμή έχουν εξαντληθεί.}}",
        "reorderReviewMods": "Ελέγξτε τις επιλογές πριν ολοκληρώσετε την παραγγελία.",
        "reorderFailed": "Λυπούμαστε — δεν μπορέσαμε να επαναφέρουμε αυτήν την παραγγελία. Δοκιμάστε να προσθέσετε τα προϊόντα χειροκίνητα.",
    },
    "bg": {
        "reorderAdded": "{count, plural, one {Добавихме # артикул от предишната ви поръчка.} other {Добавихме # артикула от предишната ви поръчка.}}",
        "reorderDroppedGone": "{count, plural, one {# артикул не можа да бъде добавен отново — вече не е в менюто.} other {# артикула не можаха да бъдат добавени отново — вече не са в менюто.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# артикул не можа да бъде добавен отново — в момента е изчерпан.} other {# артикула не можаха да бъдат добавени отново — в момента са изчерпани.}}",
        "reorderReviewMods": "Моля, прегледайте опциите, преди да завършите поръчката.",
        "reorderFailed": "Съжаляваме — не успяхме да възстановим тази поръчка. Опитайте да добавите артикулите ръчно.",
    },
    "hr": {
        "reorderAdded": "{count, plural, one {Dodali smo # stavku iz vaše prethodne narudžbe.} few {Dodali smo # stavke iz vaše prethodne narudžbe.} other {Dodali smo # stavaka iz vaše prethodne narudžbe.}}",
        "reorderDroppedGone": "{count, plural, one {# stavku nije bilo moguće ponovno dodati — više nije na jelovniku.} few {# stavke nije bilo moguće ponovno dodati — više nisu na jelovniku.} other {# stavaka nije bilo moguće ponovno dodati — više nisu na jelovniku.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# stavku nije bilo moguće ponovno dodati — trenutačno je rasprodana.} few {# stavke nije bilo moguće ponovno dodati — trenutačno su rasprodane.} other {# stavaka nije bilo moguće ponovno dodati — trenutačno su rasprodane.}}",
        "reorderReviewMods": "Provjerite opcije prije dovršetka narudžbe.",
        "reorderFailed": "Nažalost, tu narudžbu nismo mogli vratiti. Pokušajte stavke dodati ručno.",
    },
    "sr": {
        "reorderAdded": "{count, plural, one {Додали смо # ставку из ваше претходне поруџбине.} few {Додали смо # ставке из ваше претходне поруџбине.} other {Додали смо # ставки из ваше претходне поруџбине.}}",
        "reorderDroppedGone": "{count, plural, one {# ставку није било могуће поново додати — више није на јеловнику.} few {# ставке није било могуће поново додати — више нису на јеловнику.} other {# ставки није било могуће поново додати — више нису на јеловнику.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# ставку није било могуће поново додати — тренутно је распродата.} few {# ставке није било могуће поново додати — тренутно су распродате.} other {# ставки није било могуће поново додати — тренутно су распродате.}}",
        "reorderReviewMods": "Проверите опције пре завршетка поруџбине.",
        "reorderFailed": "Нажалост, нисмо могли да вратимо ту поруџбину. Покушајте да додате ставке ручно.",
    },
    "sl": {
        "reorderAdded": "{count, plural, one {Dodali smo # izdelek iz vašega prejšnjega naročila.} two {Dodali smo # izdelka iz vašega prejšnjega naročila.} few {Dodali smo # izdelke iz vašega prejšnjega naročila.} other {Dodali smo # izdelkov iz vašega prejšnjega naročila.}}",
        "reorderDroppedGone": "{count, plural, one {# izdelka ni bilo mogoče znova dodati — ni ga več na meniju.} two {# izdelkov ni bilo mogoče znova dodati — ni ju več na meniju.} few {# izdelkov ni bilo mogoče znova dodati — ni jih več na meniju.} other {# izdelkov ni bilo mogoče znova dodati — ni jih več na meniju.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# izdelka ni bilo mogoče znova dodati — trenutno je razprodan.} two {# izdelkov ni bilo mogoče znova dodati — trenutno sta razprodana.} few {# izdelkov ni bilo mogoče znova dodati — trenutno so razprodani.} other {# izdelkov ni bilo mogoče znova dodati — trenutno so razprodani.}}",
        "reorderReviewMods": "Pred zaključkom naročila preverite možnosti.",
        "reorderFailed": "Oprostite — naročila nismo mogli obnoviti. Poskusite izdelke dodati ročno.",
    },
    "ru": {
        "reorderAdded": "{count, plural, one {Добавлена # позиция из вашего предыдущего заказа.} few {Добавлены # позиции из вашего предыдущего заказа.} many {Добавлено # позиций из вашего предыдущего заказа.} other {Добавлено # позиции из вашего предыдущего заказа.}}",
        "reorderDroppedGone": "{count, plural, one {# позицию не удалось добавить снова — её больше нет в меню.} few {# позиции не удалось добавить снова — их больше нет в меню.} many {# позиций не удалось добавить снова — их больше нет в меню.} other {# позиции не удалось добавить снова — их больше нет в меню.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# позицию не удалось добавить снова — сейчас она распродана.} few {# позиции не удалось добавить снова — сейчас они распроданы.} many {# позиций не удалось добавить снова — сейчас они распроданы.} other {# позиции не удалось добавить снова — сейчас они распроданы.}}",
        "reorderReviewMods": "Пожалуйста, проверьте опции перед оформлением заказа.",
        "reorderFailed": "К сожалению, не удалось восстановить этот заказ. Попробуйте добавить позиции вручную.",
    },
    "uk": {
        "reorderAdded": "{count, plural, one {Додано # позицію з вашого попереднього замовлення.} few {Додано # позиції з вашого попереднього замовлення.} many {Додано # позицій з вашого попереднього замовлення.} other {Додано # позиції з вашого попереднього замовлення.}}",
        "reorderDroppedGone": "{count, plural, one {# позицію не вдалося додати знову — її більше немає в меню.} few {# позиції не вдалося додати знову — їх більше немає в меню.} many {# позицій не вдалося додати знову — їх більше немає в меню.} other {# позиції не вдалося додати знову — їх більше немає в меню.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# позицію не вдалося додати знову — зараз вона розпродана.} few {# позиції не вдалося додати знову — зараз вони розпродані.} many {# позицій не вдалося додати знову — зараз вони розпродані.} other {# позиції не вдалося додати знову — зараз вони розпродані.}}",
        "reorderReviewMods": "Будь ласка, перевірте опції перед оформленням замовлення.",
        "reorderFailed": "На жаль, не вдалося відновити це замовлення. Спробуйте додати позиції вручну.",
    },
    "lt": {
        "reorderAdded": "{count, plural, one {Pridėta # prekė iš ankstesnio jūsų užsakymo.} few {Pridėtos # prekės iš ankstesnio jūsų užsakymo.} other {Pridėta # prekių iš ankstesnio jūsų užsakymo.}}",
        "reorderDroppedGone": "{count, plural, one {# prekės nepavyko pridėti iš naujo — jos nebėra meniu.} few {# prekių nepavyko pridėti iš naujo — jų nebėra meniu.} other {# prekių nepavyko pridėti iš naujo — jų nebėra meniu.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# prekės nepavyko pridėti iš naujo — šiuo metu ji išparduota.} few {# prekių nepavyko pridėti iš naujo — šiuo metu jos išparduotos.} other {# prekių nepavyko pridėti iš naujo — šiuo metu jos išparduotos.}}",
        "reorderReviewMods": "Prieš užsakydami peržiūrėkite parinktis.",
        "reorderFailed": "Atsiprašome — nepavyko atkurti to užsakymo. Pabandykite prekes pridėti rankiniu būdu.",
    },
    "lv": {
        "reorderAdded": "{count, plural, zero {Pievienotas # preces no jūsu iepriekšējā pasūtījuma.} one {Pievienota # prece no jūsu iepriekšējā pasūtījuma.} other {Pievienotas # preces no jūsu iepriekšējā pasūtījuma.}}",
        "reorderDroppedGone": "{count, plural, zero {# preces neizdevās pievienot atkārtoti — to vairs nav ēdienkartē.} one {# preci neizdevās pievienot atkārtoti — tās vairs nav ēdienkartē.} other {# preces neizdevās pievienot atkārtoti — to vairs nav ēdienkartē.}}",
        "reorderDroppedSoldOut": "{count, plural, zero {# preces neizdevās pievienot atkārtoti — tās šobrīd ir izpārdotas.} one {# preci neizdevās pievienot atkārtoti — tā šobrīd ir izpārdota.} other {# preces neizdevās pievienot atkārtoti — tās šobrīd ir izpārdotas.}}",
        "reorderReviewMods": "Pirms pasūtījuma noformēšanas pārskatiet opcijas.",
        "reorderFailed": "Diemžēl neizdevās atjaunot šo pasūtījumu. Mēģiniet preces pievienot manuāli.",
    },
    "et": {
        "reorderAdded": "{count, plural, one {Lisasime # toote teie eelmisest tellimusest.} other {Lisasime # toodet teie eelmisest tellimusest.}}",
        "reorderDroppedGone": "{count, plural, one {# toodet ei õnnestunud uuesti lisada — seda pole enam menüüs.} other {# toodet ei õnnestunud uuesti lisada — neid pole enam menüüs.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# toodet ei õnnestunud uuesti lisada — see on praegu otsas.} other {# toodet ei õnnestunud uuesti lisada — need on praegu otsas.}}",
        "reorderReviewMods": "Enne tellimuse vormistamist vaadake valikud üle.",
        "reorderFailed": "Vabandame — seda tellimust ei õnnestunud taastada. Proovige tooted käsitsi lisada.",
    },
    "tr": {
        "reorderAdded": "{count, plural, one {Önceki siparişinizden # ürün eklendi.} other {Önceki siparişinizden # ürün eklendi.}}",
        "reorderDroppedGone": "{count, plural, one {# ürün yeniden eklenemedi — artık menüde değil.} other {# ürün yeniden eklenemedi — artık menüde değil.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# ürün yeniden eklenemedi — şu anda tükenmiş durumda.} other {# ürün yeniden eklenemedi — şu anda tükenmiş durumda.}}",
        "reorderReviewMods": "Lütfen ödeme yapmadan önce seçenekleri gözden geçirin.",
        "reorderFailed": "Üzgünüz — bu siparişi geri yükleyemedik. Ürünleri elle eklemeyi deneyin.",
    },
    "ca": {
        "reorderAdded": "{count, plural, one {S'ha afegit # article de la teva comanda anterior.} other {S'han afegit # articles de la teva comanda anterior.}}",
        "reorderDroppedGone": "{count, plural, one {# article no s'ha pogut tornar a afegir — ja no és al menú.} other {# articles no s'han pogut tornar a afegir — ja no són al menú.}}",
        "reorderDroppedSoldOut": "{count, plural, one {# article no s'ha pogut tornar a afegir — ara mateix està esgotat.} other {# articles no s'han pogut tornar a afegir — ara mateix estan esgotats.}}",
        "reorderReviewMods": "Revisa les opcions abans de finalitzar la comanda.",
        "reorderFailed": "Ho sentim — no hem pogut recuperar aquesta comanda. Prova d'afegir els articles manualment.",
    },
    "ar": {
        "reorderAdded": "{count, plural, zero {لم تتم إضافة أي عناصر من طلبك السابق.} one {تمت إضافة عنصر واحد من طلبك السابق.} two {تمت إضافة عنصرين من طلبك السابق.} few {تمت إضافة # عناصر من طلبك السابق.} many {تمت إضافة # عنصرًا من طلبك السابق.} other {تمت إضافة # عنصر من طلبك السابق.}}",
        "reorderDroppedGone": "{count, plural, zero {تعذّرت إضافة العناصر من جديد — لم تعد موجودة في القائمة.} one {تعذّرت إضافة عنصر واحد من جديد — لم يعد موجودًا في القائمة.} two {تعذّرت إضافة عنصرين من جديد — لم يعودا موجودين في القائمة.} few {تعذّرت إضافة # عناصر من جديد — لم تعد موجودة في القائمة.} many {تعذّرت إضافة # عنصرًا من جديد — لم تعد موجودة في القائمة.} other {تعذّرت إضافة # عنصر من جديد — لم يعد موجودًا في القائمة.}}",
        "reorderDroppedSoldOut": "{count, plural, zero {تعذّرت إضافة العناصر من جديد — نفدت كمياتها حاليًا.} one {تعذّرت إضافة عنصر واحد من جديد — نفدت كميته حاليًا.} two {تعذّرت إضافة عنصرين من جديد — نفدت كميتهما حاليًا.} few {تعذّرت إضافة # عناصر من جديد — نفدت كمياتها حاليًا.} many {تعذّرت إضافة # عنصرًا من جديد — نفدت كمياتها حاليًا.} other {تعذّرت إضافة # عنصر من جديد — نفدت كميته حاليًا.}}",
        "reorderReviewMods": "يرجى مراجعة الخيارات قبل إتمام الطلب.",
        "reorderFailed": "عذرًا — تعذّرت استعادة هذا الطلب. جرّب إضافة العناصر يدويًا.",
    },
    "he": {
        "reorderAdded": "{count, plural, one {נוסף פריט אחד מההזמנה הקודמת שלך.} two {נוספו שני פריטים מההזמנה הקודמת שלך.} many {נוספו # פריטים מההזמנה הקודמת שלך.} other {נוספו # פריטים מההזמנה הקודמת שלך.}}",
        "reorderDroppedGone": "{count, plural, one {לא ניתן היה להוסיף שוב פריט אחד — הוא כבר לא בתפריט.} two {לא ניתן היה להוסיף שוב שני פריטים — הם כבר לא בתפריט.} many {לא ניתן היה להוסיף שוב # פריטים — הם כבר לא בתפריט.} other {לא ניתן היה להוסיף שוב # פריטים — הם כבר לא בתפריט.}}",
        "reorderDroppedSoldOut": "{count, plural, one {לא ניתן היה להוסיף שוב פריט אחד — הוא אזל מהמלאי כרגע.} two {לא ניתן היה להוסיף שוב שני פריטים — הם אזלו מהמלאי כרגע.} many {לא ניתן היה להוסיף שוב # פריטים — הם אזלו מהמלאי כרגע.} other {לא ניתן היה להוסיף שוב # פריטים — הם אזלו מהמלאי כרגע.}}",
        "reorderReviewMods": "כדאי לבדוק את התוספות לפני השלמת ההזמנה.",
        "reorderFailed": "מצטערים — לא הצלחנו לשחזר את ההזמנה. אפשר לנסות להוסיף את הפריטים ידנית.",
    },
    "hi": {
        "reorderAdded": "{count, plural, one {आपके पिछले ऑर्डर से # आइटम जोड़ा गया।} other {आपके पिछले ऑर्डर से # आइटम जोड़े गए।}}",
        "reorderDroppedGone": "{count, plural, one {# आइटम दोबारा नहीं जोड़ा जा सका — यह अब मेनू में नहीं है।} other {# आइटम दोबारा नहीं जोड़े जा सके — ये अब मेनू में नहीं हैं।}}",
        "reorderDroppedSoldOut": "{count, plural, one {# आइटम दोबारा नहीं जोड़ा जा सका — यह अभी बिक चुका है।} other {# आइटम दोबारा नहीं जोड़े जा सके — ये अभी बिक चुके हैं।}}",
        "reorderReviewMods": "कृपया चेकआउट से पहले विकल्पों की जाँच कर लें।",
        "reorderFailed": "क्षमा करें — हम वह ऑर्डर वापस नहीं ला सके। कृपया आइटम खुद जोड़ने का प्रयास करें।",
    },
    "ja": {
        "reorderAdded": "{count, plural, other {前回のご注文から#品をカートに追加しました。}}",
        "reorderDroppedGone": "{count, plural, other {#品は再追加できませんでした。現在メニューにありません。}}",
        "reorderDroppedSoldOut": "{count, plural, other {#品は再追加できませんでした。現在売り切れです。}}",
        "reorderReviewMods": "ご注文前にオプションをご確認ください。",
        "reorderFailed": "申し訳ありません。ご注文を復元できませんでした。お手数ですが手動で商品を追加してください。",
    },
    "zh": {
        "reorderAdded": "{count, plural, other {已从您上次的订单中添加#件商品。}}",
        "reorderDroppedGone": "{count, plural, other {#件商品无法重新添加——已不在菜单中。}}",
        "reorderDroppedSoldOut": "{count, plural, other {#件商品无法重新添加——目前已售罄。}}",
        "reorderReviewMods": "结账前请检查选项。",
        "reorderFailed": "抱歉——我们无法恢复该订单。请尝试手动添加商品。",
    },
    "ko": {
        "reorderAdded": "{count, plural, other {이전 주문에서 #개 메뉴를 담았습니다.}}",
        "reorderDroppedGone": "{count, plural, other {#개 메뉴를 다시 담을 수 없었습니다. 더 이상 메뉴에 없습니다.}}",
        "reorderDroppedSoldOut": "{count, plural, other {#개 메뉴를 다시 담을 수 없었습니다. 현재 품절입니다.}}",
        "reorderReviewMods": "결제 전에 옵션을 확인해 주세요.",
        "reorderFailed": "죄송합니다. 해당 주문을 복원하지 못했습니다. 메뉴를 직접 추가해 주세요.",
    },
    "th": {
        "reorderAdded": "{count, plural, other {เพิ่ม # รายการจากคำสั่งซื้อก่อนหน้าของคุณแล้ว}}",
        "reorderDroppedGone": "{count, plural, other {# รายการไม่สามารถเพิ่มได้อีกครั้ง — ไม่มีในเมนูแล้ว}}",
        "reorderDroppedSoldOut": "{count, plural, other {# รายการไม่สามารถเพิ่มได้อีกครั้ง — ขายหมดในขณะนี้}}",
        "reorderReviewMods": "โปรดตรวจสอบตัวเลือกก่อนชำระเงิน",
        "reorderFailed": "ขออภัย — เราไม่สามารถกู้คืนคำสั่งซื้อนั้นได้ ลองเพิ่มรายการด้วยตนเอง",
    },
    "vi": {
        "reorderAdded": "{count, plural, other {Đã thêm # món từ đơn hàng trước của bạn.}}",
        "reorderDroppedGone": "{count, plural, other {# món không thể thêm lại — không còn trong thực đơn.}}",
        "reorderDroppedSoldOut": "{count, plural, other {# món không thể thêm lại — hiện đã hết hàng.}}",
        "reorderReviewMods": "Vui lòng kiểm tra các tùy chọn trước khi thanh toán.",
        "reorderFailed": "Rất tiếc — chúng tôi không thể khôi phục đơn hàng đó. Hãy thử thêm món theo cách thủ công.",
    },
    "id": {
        "reorderAdded": "{count, plural, other {Menambahkan # item dari pesanan Anda sebelumnya.}}",
        "reorderDroppedGone": "{count, plural, other {# item tidak dapat ditambahkan lagi — sudah tidak ada di menu.}}",
        "reorderDroppedSoldOut": "{count, plural, other {# item tidak dapat ditambahkan lagi — saat ini habis terjual.}}",
        "reorderReviewMods": "Harap periksa opsi sebelum menyelesaikan pesanan.",
        "reorderFailed": "Maaf — kami tidak dapat memulihkan pesanan itu. Coba tambahkan item secara manual.",
    },
}

added = 0
for code, keys in TRANSLATIONS.items():
    path = f"src/messages/{code}.json"
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    toasts = d["ordering"]["toasts"]
    changed = False
    for k, v in keys.items():
        if k not in toasts:
            toasts[k] = v
            changed = True
            added += 1
    if changed:
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"{code}: ok")
    else:
        print(f"{code}: already present, skipped")
print(f"done — {added} keys added across {len(TRANSLATIONS)} locales")
