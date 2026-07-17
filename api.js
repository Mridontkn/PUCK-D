function formatRelativeDate(iso){
    if(!iso) return '';

    const d = new Date(iso);

    const diffMs = Date.now() - d.getTime();

    const mins = Math.floor(diffMs / 60000);

    if(mins < 1) return "NOW";
    if(mins < 60) return `${mins}M AGO`;

    const hours = Math.floor(mins/60);

    if(hours < 24) return `${hours}H AGO`;

    const days = Math.floor(hours/24);

    if(days === 1) return "YESTERDAY";

    if(days < 7) return `${days} DAYS AGO`;

    return d.toLocaleDateString();
}

function estimateReadTime(html){

    const text = (html || "").replace(/<[^>]*>/g," ");

    const words = text.trim().split(/\s+/).filter(Boolean).length;

    return `${Math.max(1, Math.round(words/200))} MIN READ`;

}

async function loadArticlesFromSupabase(){

    const { data, error } = await db
        .from("article")
        .select("*")
        .order("created_at",{ascending:false});

    if(error){
        console.error(error);
        return [];
    }

    return data.map((row,i)=>({

        id:row.id,
        tag:row.category || "News",
        title:row.title,
        dek:row.summary,
        author:row.author,
        readTime:estimateReadTime(row.context),
        date:formatRelativeDate(row.created_at),
        imageUrl:row.image_url

    }));

}